import * as vscode from 'vscode';
import * as postcss from 'postcss';
import * as path from 'path';
import * as fs from 'fs';
import { CssUtil } from './util/css-util';

// Type of css properties
export type CssProperties = {[prop:string]: string};

// Rules that count as global scope
const globalRules = ['body', 'html', '*', ':root'];
// Empty plugin to disable postcss warning message
const noopPlugin = postcss.plugin('postcss-noop', () => {
    return async () => {}; 
});

/**
 * Represents a stylesheet document, including its scopes, warning, and decorations.
 */
export class Stylesheet {

    // Properties
    document: vscode.TextDocument;
    private text!: string;
    private baseScope!: StylesheetScope;
    private version!: number;
    private decorations!: vscode.TextEditorDecorationType[];
    private warnings!: vscode.Diagnostic[];

    // Properties to manage the file parsing lifecycle
    private parsePromise?: postcss.LazyResult = undefined;
    private parsedCallbacks: Function[] = [];

    /**
     * 
     * @param editor Current editor
     */
    constructor(document: vscode.TextDocument){
        this.document = document;
        this.loadFile();
    }

    /**
     * Loads the class properties based on the document property. Can be called to reset the class (e.g. if the file has changed)
     */
    private loadFile(){
        // Load initial properties
        this.text = fs.readFileSync(this.document.uri.fsPath, {encoding: 'utf8'});
        this.baseScope = new StylesheetScope('body'); // TODO This should be made more flexible to accomodate other root selectors
        this.version = this.document.version;
        this.decorations = [];
        this.warnings = [];
        
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
        this.parsePromise = postcss([noopPlugin]).process(this.text, { syntax: syntax, from: undefined });
        this.parsePromise.then(result => {
            if(result && result.root && result.root.nodes){
                // Create the scopes
                this.createStyleSheetScopes(result.root.nodes, this.baseScope);
                // Run parsed callbacks
                this.runCallbacks();
            }
        });
    }

    /**
     * Runs the callback functions for when the file is parsed
     */
    private runCallbacks(){
        this.parsedCallbacks.forEach((fn)=>{
            fn();
        });
        this.parsePromise = undefined;
        this.parsedCallbacks = [];
    }

    /**
     * Adds a function to be ran after the file has been parsed.
     * If there is no parsing pending, the function will be ran immediatelly.
     * @param fn 
     */
    private addParsedFileCallback(fn: Function){
        if(!this.parsePromise){
            // THere is no pending parsing. Just run the function
            fn();
        } else {
            this.parsedCallbacks.push(fn);
        }
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
            // Calculate the editor range for the current node
            let range = this.calculateRange(node);

            // Process each kind of css token
            if(node.type === 'atrule' && (node as any).variable){ 
                // VARIABLE
                // Add the variable to the current scope
                let variableNode = node as any; // Using any so we can use less syntax properties
                scope.variables[variableNode.name] = variableNode.value;
                scope.addRange(variableNode.name, range);
            
            } else if(node.type === 'decl'){ 
                // PROPERTY
                // Add the property to the current scope
                scope.addProperty(node.prop, node.value);
                scope.addRange(node.prop, range);

            } else if(node.type === 'rule'){ 
                // RULE (SELECTOR)
                let selector = node.selector;
                let newScope = scope;

                // Create a new scope if this is not the global scope
                if(!globalRules.includes(selector)){
                    // Create the new scope
                    newScope = new StylesheetScope(selector, scope);     
                    // Add the new scope to its parent's children
                    scope.children.push(newScope);
                    // Add the selector to the range mapping
                    newScope.addRange(selector, range);
                } else {
                    // This is the base scope. Add it's range
                    scope.addRange(selector, range);
                }
                
                // If this node has children, process them
                this.createStyleSheetScopes(node.nodes, newScope);  
            }
        });
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
     * @param node 
     */
    private calculateRange(node: postcss.ChildNode): vscode.Range | undefined {    
        if(node.source && node.source.start && node.source.end){
            let startPosition = new vscode.Position(node.source.start.line-1, node.source.start.column-1);
            let endPosition = new vscode.Position(node.source.end.line-1, node.source.end.column-1);

            // If this is not a rule, use the range given by postcss
            if(node.type !== 'rule'){
                return new vscode.Range(startPosition, endPosition);
            }
            
            // Otherwise, we have to search for it since postcss's range goes all the way to the end of the block.
            let targetChar = '{';
            let lineNumber = startPosition.line;
            let colNumber = startPosition.character;
            let nonWSColNumber = colNumber; // Keeps track of the latest non whitepsace character in the line
            do {
                let lineText = this.document.lineAt(lineNumber).text;
                // Search within the line
                while(colNumber < lineText.length){
                    // Check if character is the correct one
                    if(lineText[colNumber] === targetChar){
                        // Found the character. Return the position
                        endPosition = new vscode.Position(lineNumber, nonWSColNumber);
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
            } while(lineNumber < this.document.lineCount);
        }
        return undefined;
    }

    /*
     * PUBLIC API 
     */

    /**
     * Gets a scope by it's full css selector
     * TODO implement a scope map for faster access
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
}


/**
 * This class represents a scope (properties within a selector) in a less/css file.
 */
export class StylesheetScope {
    variables: CssProperties;
    children: StylesheetScope[];
    ranges: {[key:string]: vscode.Range};
    _styles!: CssProperties;

    /**
     * 
     * @param selector 
     * @param parent 
     */
    constructor(
        public selector: string,
        public parent?: StylesheetScope,
    ){
        this.styles = {};
        this.variables = {};
        this.children = [];
        this.ranges = {};
    }

    set styles(styles: CssProperties){
        this._styles = styles;
    }

    /**
     * Returns all styles for this scope, including its parent scopes'
     */
    get styles(): CssProperties {
        let styles = this._styles;
        if(this.parent){
            // If there is a parent, join its styles
            styles = {...this.parent.styles, ...styles};
        }
        return styles;
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
     * Resolves the name of a variable within the scope
     * @param variable Variable name (without the 'at' prefix);
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
     * Adds a property to the scope. If a variable is present, it will be resolved here.
     * @param prop 
     * @param value 
     */
    addProperty(prop:string, value:string){
        // Resolve variables if any
        let variables = CssUtil.GetVariablesInString(value);
        variables.forEach((varName: string)=>{
            let varValue = this.resolveVariable(varName);
            value = value.replace(`@${varName}`, varValue);
        });

        // Add property to scope
        this._styles[prop] = value;
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

    /**
     * Gets the editor range for a selector, property, or variable. If none is found, returns the scope's range scope.
     * @param rangeKey 
     */
    getRange(rangeKey: string): vscode.Range {
        if(rangeKey in this.ranges){
            return this.ranges[rangeKey];
        }
        return this.ranges[this.selector];
    }
    
    /**
     * Returns the range for the scope's selector
     */
    getSelectorRange(): vscode.Range {
        return this.getRange(this.selector);
    }

    /**
     * This method compares two CssProperties objects and returns those in otherProps that differ between them.
     * Only properties that exist in both CssProperties instances will be considered.
     * @param otherProps 
     */
    diffIntersectingCssProperties(otherProps: CssProperties): CssProperties{
        let different: CssProperties = {};
        // Expand properties
        let thisProps = CssUtil.ExpandProperties(this.styles); 
        otherProps = CssUtil.ExpandProperties(otherProps); 
        // Compare
        for(let prop in thisProps){
            if(prop in otherProps){
                // Found an intersecting property. Compare their values
                if(!CssUtil.CompareCssProperty(prop, thisProps[prop], otherProps[prop])){ 
                    different[prop] = otherProps[prop];
                }
            }
        }
        return different;
    }

    /**
     * Returns a CssProperties object with the props and values that exist in otherProps but not in this scope
     * @param otherProps 
     */
    findMissingProperties(otherProps:CssProperties): CssProperties {
        // Expand properties
        let thisStyles = CssUtil.ExpandProperties(this.styles); 
        otherProps = CssUtil.ExpandProperties(otherProps); 
        // Find missing
        let missing: CssProperties = {};
        for(let prop in otherProps){
            if(!(prop in thisStyles)){
                missing[prop] = otherProps[prop];
            }
        }
        return missing;
    }
}