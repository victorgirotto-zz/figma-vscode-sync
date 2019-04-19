import * as Figma from 'figma-js';

export type ComponentsMeta = {[key:string]: Figma.Component};

export class FigmaFile {

    key: string;
    name: string;
    lastModified: string;
    meta: ComponentsMeta;
    components: any[] = [];

    /**
     * Build a FigmaDocument instance based on a Figma.FileResponse. This instance allows searching of property values within figma nodes.
     * 
     * @param data 
     */
    constructor(data: Figma.FileResponse){
        // First, go through all components and parse their meta
        this.meta = data.components;
        this.lastModified = data.lastModified;
        this.name = data.name;
        this.key = data.document.id;

        // Add children from all pages
        data.document.children.forEach((p: any) => {
            this.components.push(...p.children);
        });
        
        // Sort alphabetically
        this.components.sort((a,b) => a.name.localeCompare(b.name));
    }
}