# ---- Build-Stufe ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm prune --prod

# ---- Laufzeit-Stufe (schlank, non-root) ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Nicht-Root-Benutzer
RUN addgroup -S astoris && adduser -S astoris -G astoris
# Nur das Nötige aus dem Build übernehmen
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Datenverzeichnisse (werden als Volume gemountet)
RUN mkdir -p /app/data /app/certs && chown -R astoris:astoris /app
USER astoris
EXPOSE 3000
# Healthcheck gegen den Login-Endpunkt
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/login || exit 1
CMD ["node", "build"]
