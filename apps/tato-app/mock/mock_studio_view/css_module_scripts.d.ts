// A stylesheet a fixture view imports as a CSS module script, `with { type: "css" }`, is a
// constructed sheet the view's document adopts.
declare module "*.css" {
  const stylesheet: CSSStyleSheet;
  export default stylesheet;
}
