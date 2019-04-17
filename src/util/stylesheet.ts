import * as vscode from 'vscode';
import * as postcss from 'postcss';
import { LinksMap } from '../link';

export type CssProperties = {[prop:string]: string};
const globalRules = ['body', 'html', '*', ':root'];

export class Stylesheet {
    text: string;
    baseScope: StylesheetScope;
    version: number;

    constructor(
        private editor: vscode.TextEditor, 
        private links: LinksMap
    ){
        this.text = this.editor.document.getText();
        this.baseScope = new StylesheetScope('body');
        this.version = this.editor.document.version;
        
        // Parse the file
        this.parseFile();
    }

    /**
     * Parses a less file to map variables, selectors, and properties.
     * 
     * This uses postcss with a less syntax.
     */
    private parseFile(){
        const syntax = require('postcss-less');
        postcss().process(this.text, { syntax: syntax, from: undefined }).then(result => {
            if(result && result.root && result.root.nodes){
                this.createStyleSheetScopes(result.root.nodes, this.baseScope);
            }
        });
    }

    /**
     * 
     * @param nodes 
     * @param scope 
     */
    private createStyleSheetScopes(nodes: postcss.ChildNode[] | undefined, scope: StylesheetScope){
        if(!nodes){ // If no nodes are present, don't do anything
            return;
        }

        // For each node, check their type and execute the appropriate action
        nodes.forEach(node => {
            if(node.type === 'atrule' && (node as any).variable){ // Processing a variable  
                // Add the variable to the current scope
                let variableNode = node as any; // TODO This could probably be improved. I'm not sure how to handle the additions postcss-less does to the node type
                scope.variables[variableNode] = variableNode.value;
            
            } else if(node.type === 'decl'){ // Processing a property
                // Add the property to the current scope
                scope.addProperty(node.prop, node.value);

            } else if(node.type === 'rule'){ // Processing a rule
                let selector = node.selector;
                let newScope = scope;

                // Create a new scope if this is not the global scope
                // TODO handle this better, e.g. html scope, etc.
                if(!globalRules.includes(selector)){
                    // Create the new scope
                    newScope = new StylesheetScope(selector, scope);     
                    // Add the new scope to its parent's children
                    scope.children.push(newScope);
                    // Add the selector to the range mapping
                    let range = this.calculateRange(node);
                    newScope.addRange(selector, range);
                }
                
                // If this node has children, process them
                this.createStyleSheetScopes(node.nodes, newScope);  
            }
        });
    }

    updateLinks(links: LinksMap){
        // TODO Implement
    }

    /**
     * 
     * @param selector full css selector, starting from root scope
     */
    getScope(selector: string): StylesheetScope | undefined{
        let scope = this._getScope(selector, this.baseScope);
        return scope;
    }

    /**
     * Returns an array of strings with all full css selectors within the base scope
     */
    getAllSelectors(): string[] {
        return this.baseScope.getAllSelectorsList();
    }

    /**
     * Gets a scope based on the full css selector
     * 
     * @param selector 
     * @param scope 
     */
    private _getScope(selector: string, scope: StylesheetScope): StylesheetScope | undefined {
        // Check if this scope is the desired one
        if(scope.cssScopeName === selector){
            return scope;
        }
        
        // This is not the right scope. Look at it's children;
        for(let i = 0; i < scope.children.length; i++) {
            let childScope = scope.children[i];
            let result = this._getScope(selector, childScope);
            if(result){
                return result;
            }
        }
        
        // Didn't find anything.
        return undefined;
    }

    /**
     * Based on the start position and token type, this method looks for the 
     * end character of the token and returns its position. If there is no end, returns undefined.
     * @param type 
     * @param startRange 
     */
    private calculateRange(node: postcss.ChildNode): vscode.Range | undefined {    
        if(node.source && node.source.start){
            let startPosition = new vscode.Position(node.source.start.line-1, node.source.start.column-1);
    
            // Get target character based on the token type
            let targetChar = ((targetType:string) => {
                switch(targetType){
                    case 'rule':
                        return '{';
                    default:
                        return ';';
                }
            })(node.type);
    
            // // Search for it
            let lineNumber = startPosition.line;
            let colNumber = startPosition.character;
            let nonWSColNumber = colNumber; // Keeps track of the latest non whitepsace character in the line
            do {
                let lineText = this.editor.document.lineAt(lineNumber).text;
                // Search within the line
                while(colNumber < lineText.length){
                    // Check if character is the correct one
                    if(lineText[colNumber] === targetChar){
                        // Found the character. Return the position
                        let endPosition = new vscode.Position(lineNumber, nonWSColNumber);
                        return new vscode.Range(startPosition, endPosition);
                    }
                    // Update non whitespace column number
                    if(/\s/.test(lineText[colNumber])){
                        nonWSColNumber = colNumber;
                    }
                    // Increment column number
                    colNumber++;
                }
            
                // Line ended and still haven't found it. Look in the next line.
                lineNumber++;
                colNumber = 0;
            } while(lineNumber < this.editor.document.lineCount);
        }
        return undefined;
    }

}

export class StylesheetScope {
    props: CssProperties;
    variables: CssProperties;
    children: StylesheetScope[];
    ranges: {[key:string]: vscode.Range};

    /**
     * 
     * @param selector 
     * @param parent 
     */
    constructor(
        public selector: string,
        public parent?: StylesheetScope,
    ){
        this.props = {};
        this.variables = {};
        this.children = [];
        this.ranges = {};
    }

    /**
     * Resolves any '&' characters to their parent's resolved scope name
     */
    get resolvedScopeName(): string {
        if(this.selector.includes('&') && this.parent){
            // Get parent resolved selector
            let parentSelector = this.parent.resolvedScopeName;
            return this.selector.replace('&', parentSelector);
        }
        return this.selector;
    }

    /**
     * Resolves the scope chain name into a CSS (not LESS) selector
     * 
     * e.g.
     * 
     *      .button { &:hover { ... } } -> .button:hover
     */
    get cssScopeName(): string {
        if(this.selector.includes('&') && this.parent){
            // Scope has parent and has & selector. Replace & with parent's css selector
            let parentSelector = this.parent.cssScopeName;
            return this.selector.replace('&', parentSelector);
        } else if (this.parent){
            // Selector has parent but no &. Just prepend parent selector
            return `${this.parent.cssScopeName} ${this.selector}`;
        }
        // It doesn't have a parent. Just return it.
        return this.selector;
    }

    /**
     * Returns a list of all css selectors within this scope (starting with itself)
     */
    getAllSelectorsList(): string[] {
        let list = [this.cssScopeName];
        this.children.forEach(child => {
            list.push(...child.getAllSelectorsList());
        });
        return list;
    }

    /**
     * 
     * @param scopeSelector 
     */
    findScope(scopeSelector: string){
        
    }

    /**
     * 
     * @param variable 
     */
    resolveVariable(variable:string): string{
        // First look in the current scope
        if(variable in this.variables){
            return this.variables[variable];
        } 
        // If not in curent scope, recursively look at parents
        if(this.parent){
            return this.parent.resolveVariable(variable);
        }
        // If nothing, return the original value
        return variable;
    }

    /**
     * 
     * @param prop 
     * @param value 
     */
    addProperty(prop:string, value:string){
        let finalValue = value;
        if(value[0] === '@'){
            // this is a variable. Resolve it.
            finalValue = this.resolveVariable(value.substring(1));
        }
        this.props[prop] = finalValue;
    }

    /**
     * Adds a mapping of document ranges for each part of the scope (variables, props, selector, etc.)
     * @param node 
     * @param range
     */
    addRange(key: string, range?: vscode.Range){
        if(range){
            this.ranges[key] = range;
        }
    }
}