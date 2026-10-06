/** The one call "Smart import" makes into mammoth's browser build: a .docx's plain text. */
declare module 'mammoth/mammoth.browser.js' {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}
