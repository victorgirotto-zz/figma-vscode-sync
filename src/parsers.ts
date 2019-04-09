import { FigmaUtil } from "./figmautil";

export class Parser {
    
    node: any;

    constructor(node: any){
        this.node = node;
    }

    px(number:number){
        return number + 'px';
    }

    /*
        Actives all handlers to parse styles from a Figma node
    */
    parse(): { [string:string]: Object }{
        let props = {};
        // Go through the props in the node
        for(let prop in this.node){
            if(this.node.hasOwnProperty(prop)){
                // Handle the prop. If no handler exists for it, props will remain unchanged.
                props = {...props, ...this.handleProp(prop)};
            }
        }
        return props;
    }

    handleProp(prop: string): {}{
        let css: { [string:string]: Object } = {};
        let value = this.node[prop];
        switch (prop) {
            case 'style':
                css ={
                    'font-family': `'${value.fontFamily}'`,
                    'font-size': this.px(value.fontSize),
                    'font-weight': value.fontWeight,
                    'line-height': this.px(value.lineHeightPx)
                };
                break;
            case 'fills':
                var prop = this.node.type === 'TEXT' ? 'color' : 'background-color';
                // Array of fills {blendMode, type, color(rgba)}
                for (let i = 0; i < value.length; i++) {
                    const fill = value[i];
                    if(fill.type === 'SOLID'){
                        css[prop] = FigmaUtil.getColorString(fill.color);         
                    }
                }
                break;
        }
        return css;
    }



}