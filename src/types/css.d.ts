import "react";

/*
 * Les variables CSS dans `style` (`--d`, `--r`, `--main-w`…), que lisent globals.css et les classes de Tailwind : sans
 * cast, le reste de l’objet reste vérifié (une faute comme `widht` ne compile pas). ESLint refuse `as CSSProperties`.
 */
declare module "react" {
  interface CSSProperties {
    [variable: `--${string}`]: string | number | undefined;
  }
}
