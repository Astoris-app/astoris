import { handleAgentMcp } from '$lib/server/agent-mcp';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = ({ request, url }) => handleAgentMcp(request, url);
