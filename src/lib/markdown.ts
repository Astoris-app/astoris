// Markdown → sicheres HTML. DOMPurify schützt vor XSS im Modell-Output.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

function escape(s: string): string {
	return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export function renderMarkdown(text: string): string {
	if (typeof window === 'undefined') return escape(text); // SSR: kein DOMPurify
	const raw = marked.parse(text ?? '', { async: false }) as string;
	return DOMPurify.sanitize(raw, {
		ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
		ALLOWED_ATTR: ['href', 'title'],
		ALLOW_DATA_ATTR: false
	});
}
