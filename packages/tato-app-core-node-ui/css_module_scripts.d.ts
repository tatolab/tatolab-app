// A stylesheet imported as a CSS module script, `with { type: "css" }`, is a constructed sheet a
// shadow root adopts.
declare module "*.css" {
  const stylesheet: CSSStyleSheet;
  export default stylesheet;
}
