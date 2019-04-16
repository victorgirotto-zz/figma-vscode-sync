import * as vscode from 'vscode';
import * as postcss from 'postcss';
import { Links } from './storage';

export type CssProperties = {[prop:string]: string};
const globalRules = ['body', 'html', '*', ':root'];

export class Stylesheet {
    
    text: string;
    baseScope: StylesheetScope;
    version: number;

    constructor(
        private editor: vscode.TextEditor, 
        private context: vscode.ExtensionContext
    ){
        this.text = this.editor.document.getText();
        this.baseScope = new StylesheetScope('body');
        this.version = this.editor.document.version;
        this.parseFile();
    }

    /**
     * Parses a less file to map variables, selectors, and properties.
     * TODO This implementation is not robust. Improve it. 
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
                    newScope.addRange(selector, node);
                }
                
                // If this node has children, process them
                this.createStyleSheetScopes(node.nodes, newScope);  
            }
        });
    }

    /**
     * 
     * @param selector 
     */
    getScope(selector: string){
        return this._getScope(selector, this.baseScope);
    }

    /**
     * 
     * @param selector 
     * @param scope 
     */
    private _getScope(selector: string, scope: StylesheetScope): StylesheetScope | undefined{
        // Check if this scope is the desired one
        if(scope.selector === selector){
            return scope;
        }
        
        // This is not the right scope. Look at it's children;
        scope.children.forEach(childScope => {
            let result = this._getScope(selector, childScope);
            if(result){
                return result;
            }
        });
        
        // Didn't find anything.
        return;
    }

}

export class StylesheetScope {

    props: CssProperties;
    variables: CssProperties;
    children: StylesheetScope[];
    ranges: {[key:string]: {}};

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
     */
    addRange(key: string, node: postcss.ChildNode){
        // Check if node has all needed properties
        if(node.source && node.source.start && node.source.end){
            // Create range and add it to scope
            let start = new vscode.Position(node.source.start.line, node.source.start.column);
            let end = new vscode.Position(node.source.end.line, node.source.end.column);
            this.ranges[key] = new vscode.Range(start, end);
        }

    }
}