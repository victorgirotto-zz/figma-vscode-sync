import * as Figma from 'figma-js';

/*
    A set of fuctions for interacting with nodes from figma-js

    TODO I'm using the any type for the nodes since figma-js does not seem to
    have a supertype with the children property shared across different types of nodes.
    (I thought the Node type alias was supposed to be that, but intellisense isn't working with it.)
*/

export class FigmaUtil {


   /**
    * Returns a color string for a Figma.Color. If alpha is different than 1, the string will be in rgba format. Otherwise, hex.
    * 
    * @param color Figma.Color instance
    */
    static getColorString(fill: Figma.Paint): string | undefined{
        let color = fill.color;
        if(color){
            // Create rounding fn
            let round = (n:number) => Math.round(n * 10) / 10;
            // Round values
            let alpha = round(color.a * fill.opacity);
            let r = color.r;
            let g = color.g;
            let b = color.b;
            if(alpha < 1){
                // Return in rgba
                return `rgba(${round(r)},${round(g)},${round(b)},${alpha})`;
            } else {
                // Return in HEX
                let convert = (channel: number) => { return Math.floor(channel * 255).toString(16).padStart(2,'0'); };
                return ('#'+convert(r)+convert(g)+convert(b)).toUpperCase();
            }
        }
    }

    /**
     * Gets a css selector from a string. Format: <data>
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