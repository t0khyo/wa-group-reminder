export function cleanJidForDisplay(jid: string): string {
  return jid.replace(/@lid$/, "").replace(/@s\.whatsapp\.net$/, "");
}
