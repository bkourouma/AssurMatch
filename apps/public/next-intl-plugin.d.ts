/**
 * next-intl/plugin's own declaration imports the `next` package root, whose `types/global` reference
 * augments NodeJS.ProcessEnv for the whole shared TypeScript programme (backend included). The plugin
 * is only ever called from next.config.ts, so it is declared locally with the shape we use.
 */
declare module "next-intl/plugin" {
  type NextIntlPlugin = <TConfig>(config: TConfig) => TConfig;
  export default function createNextIntlPlugin(requestConfig?: string): NextIntlPlugin;
}
