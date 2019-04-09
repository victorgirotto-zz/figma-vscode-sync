import * as Figma from 'figma-js';

/*
    TODO I'm using the any type for the nodes since figma-js does not seem to
    have a supertype with the children property shared across different types of nodes.
*/

export class FigmaUtil {

    /*
        Gets all nodes that match a condition function
    */
    static getAllChildren(rootNode: any, condition: Function){
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

    /*
        Gets all nodes of a given type within the frame
    */
    static getAllChildrenByType(rootNode: any, type: string){
        return this.getAllChildren(rootNode, (node: any) => { return node.type === type });
    }

    /*
        Returns a color string for a Figma.Color. If alpha is different than 1, the string will be in rgba format. Otherwise, hex.
    */
    static getColorString(color: Figma.Color){
        if(color.a < 1){
            // Return in rgba
            return `rgba(${color.r},${color.g},${color.b},${color.a})`;
        } else {
            // Return in HEX
            return FigmaUtil.rgbaToHex(color);
        }
    }

    /*
        Converts a Figma.Color (rgba) to a hex string
    */
    static rgbaToHex(color: Figma.Color){
        let convert = (channel: number) => { return (channel * 255).toString(16).padStart(2,'0'); };
        let r = convert(color.r);
        let g = convert(color.g);
        let b = convert(color.b);
        return ('#'+r+g+b).toUpperCase();
    }

    /*
        Gets a css selector from a string (usuaylly the layer name in Figma).
        Should be enclosed in angle brackets. If no angle brackets found, return empty string;
    */
    static parseLayerName(name: string): string{
        let bracketContent = name.match(/<([^\s>]+)(\s|>)+/);
        if(bracketContent && bracketContent.length > 0){
            return bracketContent[1];
        }
        return '';
    }


    static getFontStyles(){

    }

}