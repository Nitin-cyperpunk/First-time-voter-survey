export async function copyTextToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  try {
    await navigator.clipboard.writeText(trimmed);
    return true;
  } catch {
    return false;
  }
}
