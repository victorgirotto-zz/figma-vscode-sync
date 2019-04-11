import * as Figma from 'figma-js';

/*
    A set of fuctions for interacting with nodes from figma-js

    TODO I'm using the any type for the nodes since figma-js does not seem to
    have a supertype with the children property shared across different types of nodes.
    (I thought the Node type alias was supposed to be that, but intellisense isn't working with it.)
*/

export class FigmaUtil {

    /**
     * Gets all nodes that match a condition function
     * 
     * @param rootNode Node from which search will begin.
     * @param condition Function for determining whether a node is to be returned or not. Receives a node as parameter, and should return a boolean.
     */
    static getAllChildren(rootNode: any, condition: Function): any[]{
        let nodes: any[] = [];
        if(rootNode.children){
            rootNode.children.forEach((child: any) => {
                // Add the node itself if it's a match
                if(condition(child)){
                    nodes.push(child);
                }
                // Do the same for the children
                nodes.push(...this.getAllChildren(child, condition));
            });
        }
        return nodes;
    }

   /**
    * Returns a color string for a Figma.Color. If alpha is different than 1, the string will be in rgba format. Otherwise, hex.
    * 
    * @param color Figma.Color instance
    */
    static getColorString(color: Figma.Color){
        if(color.a < 1){
            // Return in rgba
            return `rgba(${color.r},${color.g},${color.b},${color.a})`;
        } else {
            // Return in HEX
            let convert = (channel: number) => { return (channel * 255).toString(16).padStart(2,'0'); };
            let r = convert(color.r);
            let g = convert(color.g);
            let b = convert(color.b);
            return ('#'+r+g+b).toUpperCase();
        }
    }

    /**
     * Gets a css selector from a string (usuaylly the layer name in Figma). Format: <data>
     * If metadata doesn't exist, return undefined
     * 
     * @param text the text from which the metadata should be extracted.
     */
    static extractStringMetadata(text: string): string | undefined{
        let bracketContent = text.match(/<([^\s>]+)(\s|>)+/);
        if(bracketContent && bracketContent.length > 0){
            return bracketContent[1];
        }
        return;
    }
}