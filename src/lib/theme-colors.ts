function rgb(hex: string): number[] {
	return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}
function luminance(hex: string): number {
	const values = rgb(hex).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
	return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
export function contrastRatio(a: string, b: string): number {
	const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (values[0] + .05) / (values[1] + .05);
}
/** Keep the accent hue while darkening text until it is readable on light surfaces. */
export function lightLinkColor(accent: string): string {
	let color = accent;
	for (let attempt = 0; attempt < 30; attempt++) {
		if (contrastRatio(color, '#f5f1e9') >= 4.5) return color;
		color = '#' + rgb(color).map((v) => Math.floor(v * .9).toString(16).padStart(2, '0')).join('');
	}
	return '#2b2419';
}
