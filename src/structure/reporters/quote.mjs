/** Quote a source-controlled value without emitting line or terminal controls. */
export function quoteText(value) {
  return JSON.stringify(String(value)).replace(/[\u007f-\u009f\u2028\u2029]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
