import * as Figma from 'figma-js';
import { NodeType } from 'figma-js';
import { FigmaUtil } from './figmautil';
import { LessRule } from './lessrule';

export class FigmaLessParser {

    // Settings constants TODO extract this to a settings file
    // These are case-sensitive
    private tokensFrameName: string = 'Tokens';
    private typographyFrameName: string = 'Typography';
    private colorFrameName: string = 'Colors';
    
    // Figma response properties
    key: string;
    file: Figma.FileResponse;
    pages: any; // TODO define type
    rootNodes: { [name: string]: Figma.Global } = {}; // Map of root nodes 
    figmaStyles: any = {}; // TODO define type

    // LESS properties
    tokens: { [token:string] : string } = {}; // Map of global tokens (e.g. colors, padding, etc.)
    styles: { [rule:string] : LessRule } = {};

    constructor(key:string, file: Figma.FileResponse){
        this.key = key;
        this.file = file;
        this.pages = file.document.children;
        
        // Create a map with rootNodes.name -> rootNode. Root nodes are the first children of a page.
        // Normally (but not necessarily) they will be frames.
        // First, go through each page
        for (let i = 0; i < this.pages.length; i++) {
            const page = this.pages[i];
            // Then, go trough each child in a page and add it to the map
            for (let j = 0; j < page.children.length; j++) {
                const node: Figma.Global = page.children[j];
                this.rootNodes[node.name] = node;
            }
        }

        // Create styles map
        for(let prop in this.file.styles){
            let style = this.file.styles[prop];
            this.figmaStyles[prop] = {
                type: style.styleType,
                name: this.cleanName(style.name),
            };
        }
    }

    /*
        Cleans up a name by doing the following:
        * Make it lower case
        * removing non alpha-num characters
        * Replacing spaces with dashes
    */
    cleanName(name: string): string {
        return name.split(' ') // Break at the spaces
            .map(s => s.replace(/\W/g, '')) // Remove non alphanum characters
            .filter(s => {return s !== '';}) // Remove empty strings
            .join('-') // Concat into a single string
            .toLowerCase(); // Make it lower case
    }

    /*
        Gets one string with the entire content of the target less file
    */
    getFileContentString(): string {
        return [
            // Comment with file key (this links the less file to the Figma file)
            this.addBlock(this.getFileKeyComment()),
            
            // TODO Font declarations

            // TOKENS
            // Literal
            this.addBlock(this.getLiteralTokens(), 'Tokens'),
            // Color
            this.addBlock(this.getColorTokens(), 'Colors'),
            // Effects TODO
            // Padding TODO

            // Global styles
            this.addBlock(this.getGlobalStyles(), 'Global styles'),

            // Typography
            this.addBlock(this.getTypographyStyles(), 'Typography'),

            // TODO Components
        ].join(''); // Join all string;
    }

    addBlock(newBlock:string, comment?: string){
        // If there is a comment, add it first. Otherwise, start with an empty string.
        let contentString: string = comment ? `/*\n\t${comment}\n*/\n` : '';
        // Add the block itself
        contentString += newBlock;
        // Add some whitespace
        contentString += '\n\n';
        return contentString;
    }

    getFileKeyComment(): string {
        return `/* Figma file: <<${this.key}>> (DO NOT REMOVE) */`;
    }

    getLiteralTokens(): string {
        let string = '';
        // Get the frame with the tokens
        let tokensNode = this.rootNodes[this.tokensFrameName] as Figma.Frame;
        // Get all text nodes, which contain the tokens
        let tokens = FigmaUtil.getAllChildrenByType(tokensNode, 'TEXT');
        // Add text for each token
        tokens.forEach((token: Figma.Text) => {
            // Check if it roughly complies to the expected format: starts with @ and has a colon.
            // If not, just ignore the token
            // TODO make this more robust
            if(token.characters[0] === '@' && token.characters.includes(':')){
                // Add to global styles
                let parts = token.characters.split(':');
                this.tokens[parts[0].trim()] = parts[1].trim();
                // Add to string
                string += `${token.characters}\n`;
            } else {
                // Does not comply to 
                console.warn(`Literal token ${token.characters} not included. Token literals must follow the format "@key: value;".`);
            }
        });
        return string;
    }

    getColorTokens(): string {
        let string = '';
        let colorFrame = this.rootNodes[this.colorFrameName] as Figma.Frame; 
        // TODO extract the node selection logic to a config file
        let colors = FigmaUtil.getAllChildren(colorFrame, (node:any)=> { return node.type === 'RECTANGLE' && node.name === 'Main Color'; });
        colors.forEach((colorNode: any) => { // TODO figma-js bug? Figma. Rectangle should but does not have a styles property
            let styleId = colorNode.styles['fill'];
            let fill = colorNode.fills[0];
            // TODO Handle more than one fill;
            // Add color to global styles
            if(fill.type === 'SOLID'){
                // Deal with solid fills
                let colorString = FigmaUtil.getColorString(fill.color);
                this.figmaStyles[styleId].color = colorString;
                // Add to string
                let styleName = this.figmaStyles[styleId].name;
                string += `@${styleName}: ${colorString};\n`;
            }
            // TODO Deal with other fill types
        });
        return string;
    }

    /*
        Adds the text styles based on the typography frame. 
        It will add the body style as the parent of all other typography nodes.
    */
    getTypographyStyles(): string {
        let typeFrame = this.rootNodes[this.typographyFrameName] as Figma.Frame;
        // TODO extract the node selection logic to a config file
        let bodyExample = FigmaUtil.getAllChildren(typeFrame, (node:any) => { 
            return node.type === 'TEXT' && node.name[0] !== '_' && node.name.includes('body'); 
        })[0];
        let typeExamples = FigmaUtil.getAllChildren(typeFrame, (node:any) => { 
            return node.type === 'TEXT' && node.name[0] !== '_' && !node.name.includes('body'); 
        });
        
        // Create body rule
        let lessBody = new LessRule(FigmaUtil.parseLayerName(bodyExample.name), bodyExample);
        // Create other rules and add them as a child of body
        typeExamples.forEach((typeNode: any) => { // TODO figma-js bug? Figma.Text should but does not have a styles property
            var selector = FigmaUtil.parseLayerName(typeNode.name);
            // Check if there is any information in the layer name
            if (selector) {
                lessBody.addChild(new LessRule(selector, typeNode));
            }
        });
        
        // Return formatted string         
        return lessBody.toString();
    }

    /*
        These global styles are those applicable to all elements that cannot be inferred from the Figma files.
        E.g. box-sizing.
    */
    getGlobalStyles(): string {
        let styles: string = '';
        styles += 'html { box-sizing: border-box; }\n';
        styles += '*, *:before, *:after { box-sizing: inherit; }\n';
        return styles;
    }

}