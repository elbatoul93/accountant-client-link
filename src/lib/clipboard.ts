// Safari-compatible clipboard copy.
// Must be invoked synchronously from the user gesture — do not await before calling.
export const copyToClipboard = (text: string): boolean => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => safariCopyFallback(text));
      return true;
    }
  } catch {
    /* fall through */
  }
  return safariCopyFallback(text);
};

const safariCopyFallback = (text: string): boolean => {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};
