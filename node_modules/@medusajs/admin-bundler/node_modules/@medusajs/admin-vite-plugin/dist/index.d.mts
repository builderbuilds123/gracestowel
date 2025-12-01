import * as Vite from 'vite';

interface MedusaVitePluginOptions {
    sources?: string[];
    pluginMode?: boolean;
}
type MedusaVitePlugin = (config?: MedusaVitePluginOptions) => Vite.Plugin;

declare const medusaVitePlugin: MedusaVitePlugin;

export { type MedusaVitePlugin, medusaVitePlugin as default };
