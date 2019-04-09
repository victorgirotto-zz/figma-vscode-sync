import { Parser } from "./parsers";

export class LessRule {

    depth: number; // Used to calculated the indentation of the code
    selector: string;
    props: { [string:string]: Object } = {};
    parent: LessRule | undefined;
    children: LessRule[] = [];
    // TODO mixins
     

    constructor(selector: string, figmaNode?: any, parent?: LessRule){
        this.selector = selector;
        this.depth = parent ? parent.depth + 1 : 0;
        // If figma node was passed, parse it
        if(figmaNode){
            this.parseNode(figmaNode);
        }
        // If node has a parent, add itself as a child
        if(parent){
            // This will also set this.parent
            parent.addChild(this);
        }
    }

    /*
        Adds a child to the current node if not a child already. 
        It will also clean up redundant styles (i.e. those cascading down from parents);
    */
    addChild(rule: LessRule){
        if(!this.children.includes(rule)){ // Prevent re-adding existing children
            // Add connections
            this.children.push(rule);
            rule.parent = this;
            rule.depth = this.depth + 1;

            // Recursively clean up redundant rules
            this.cleanStyles();
        }
    }

    /*
        Recusrively clean up redundant styles (i.e. those cascading down from parents);
    */
    cleanStyles(){
        this.children.forEach(child => {
            for(let prop in child.props){
                if(prop in this.props && child.props[prop] === this.props[prop]){
                    // Both this element and the rule have the same property with the same value. Delete the child's
                    delete child.props[prop];
                    // Do the same for each rule child
                    child.children.forEach(grandChild => {
                        grandChild.cleanStyles();
                    });
                }
            }
        });
    }

    /*
        Adds styles based on a Figma Node
    */
    parseNode(node: any){
        let parser = new Parser(node);
        this.props = parser.parse();
    }

    /*
        Generates a formatted string for this LESS rule
    */
    toString(): string{
        // Add selector
        let string = this.formatLine(`${this.selector} {`);
        // Add properties
        for(let prop in this.props){
            let val = this.props[prop];
            string += this.formatLine(`\t${prop}:${val};`);
        }
        // Add children
        this.children.forEach(child => {
            // Add space 
            string += '\n';
            string += child.toString();
        });
        // Close rule
        string += this.formatLine('}');
        return string;
    }

    /*
        Indents a string to the correct depth;
    */
    formatLine(string: string): string{
        return '\t'.repeat(this.depth) + string + '\n';
    }

    

}