import * as Figma from 'figma-js';

export type ComponentsMeta = {[key:string]: Figma.Component};

export class FigmaFile {

    key: string;
    name: string;
    lastModified: string;
    meta: ComponentsMeta;
    nodes: any[] = [];

    /**
     * Build a FigmaDocument instance based on a Figma.FileResponse. This instance allows searching of property values within figma nodes.
     * 
     * @param data 
     */
    constructor(data: Figma.FileResponse, key: string){
        this.meta = data.components;
        this.lastModified = data.lastModified;
        this.name = data.name;
        this.key = key;

        // Create document node
        let documentNode = {
            id: key,
            name: data.name,
            children: [] as any[],
            type: 'DOCUMENT'
        };

        // Add children from all pages
        data.document.children.forEach((page: any) => {
            documentNode.children.push(...page.children);
        });
        
        // Sort children alphabetically
        documentNode.children.sort((a,b) => a.name.localeCompare(b.name));

        // Add node to file
        this.nodes.push(documentNode);
    }
}