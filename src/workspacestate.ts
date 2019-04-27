import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { DataStorage } from './storage';
import { Stylesheet, StylesheetScope, CssProperties } from './stylesheet';
import { FigmaFile } from './figmafile';
import { FigmaLayerProvider, FigmaLayer, CssPropertiesProvider, LinksManagerProvider } from './sidebar';
import { LayerSelectorLink, LinksMap, IdOrder } from './link';

const supportedLanguages = ['less']; // List of supported file types
const APIKeyConfigName = 'APIKey';
const ignoreInternalLayersConfigName = 'IgnoreInternalLayers';

enum Status {
    SYNCING, // Waiting for data from Figma
    SYNCED, // Synced with Figma and ready
    NOT_ATTACHED, // Supported file, but not attached 
    UNSUPPORTED, // Unsupported file
    ERROR // Somethign went wrong
}

/**
 * Represents and manipulates everything related to the state of the currently open workspace
 */
export class WorkspaceState {
    static statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

    // VSCode properties
    private editor: vscode.TextEditor;
    private context: vscode.ExtensionContext;
    private uri: vscode.Uri;
    private config: vscode.WorkspaceConfiguration;
    private diagnostics: vscode.DiagnosticCollection;
    
    // Persisted properties API
    private storage!: DataStorage; // for persisting and retrieving data
    
    // View managers
	private stylesheet!: Stylesheet; // Represents the style scopes in the current file
    private sidebarProvider!: FigmaLayerProvider; // Represents and manipulates all FigmaLayer instances
    private treeView!: vscode.TreeView<FigmaLayer>;

	/**
	 * 
	 * @param editor Currently open editor
	 * @param context extension context
	 */
	constructor(editor: vscode.TextEditor, context: vscode.ExtensionContext, diagnostics: vscode.DiagnosticCollection){
        // Set vscode properties
        this.editor = editor;
        this.context = context;
        this.uri = this.editor.document.uri;
        this.diagnostics = diagnostics;
        this.config = vscode.workspace.getConfiguration();
        // Load from storage
        this.load();
    }

    /**
     * Based on the vscode properties, loads data from storage and sets up the views
     */
    load() {
        // Load persisted data
		this.storage = new DataStorage(this.uri.path, this.context);
        
        // Set initial view states
        this.status = this.getDefaultStatus();
        this.loadSidebar();
        // this.createCssPropertiesProvider();
        // this.createLinksManagerProvider();
		
		// // Instantiate view the stylesheet view manager
        // this.stylesheet = new Stylesheet(this.editor, this.diagnostics);
        // // Wait for the file parsing to end before continuing with loading
        // this.stylesheet.addParsedFileCallback(()=>{
        //     // Load links
        //     this.updateViewsWithLinks();
        // });
    }

    /**
     * Removes any lingering elements from the screen
     */
    dispose(){
        // Remove decorations
        this.stylesheet.clear();
    }


    /*==========
        LINKS
    ============*/

    /**
     * Returns a list of all link IDs
     */
    get linksIds(): string[][] {
        return this.storage.links;
    }

    /**
     * Returns an array representing all existing links between figma layers and selectors
     */
    get links(): LayerSelectorLink[] {
        let linkIds = this.linksIds;
        let links = linkIds.reduce((acc, ids) => {
            let layer = this.getLayerById(ids[IdOrder.Layer]);
            let scope = this.getScopeByFullSelector(ids[IdOrder.Scope]);
            if(scope && layer){
                acc.push(new LayerSelectorLink(layer, scope));
            }
            return acc;
        }, [] as LayerSelectorLink[]);
        return links;
    }

    /**
     * Returns a set of all existing links indexed by the layer id
     */
    get linksByLayer(): LinksMap {
        return this._getLinksBy(IdOrder.Layer);
    }
    
    /**
     * Returns a set of all existing links indexed by the layer id
     */
    get linksBySelector(): LinksMap {
        return this._getLinksBy(IdOrder.Scope);
    }

    /**
     * Returns a boolean stating whether this layer is linked or not
     * @param layer 
     */
    isLayerLinked(layer: FigmaLayer): boolean{
        let links = this.linksByLayer;
        if(layer.id in links){
            return true;
        }
        return false;
    }

    /**
     * Gets a map of links by either the scope or layer ID
     * @param type IdOrder of the desired mapping
     */
    private _getLinksBy(type: IdOrder): LinksMap{
        let links = this.storage.links;
        let linksMap = links.reduce((acc, ids) => {
            // Retrieve both
            let layer = this.getLayerById(ids[IdOrder.Layer]);
            let scope = this.getScopeByFullSelector(ids[IdOrder.Scope]);
            let key = ids[type];
            // If both found, add to object
            if(layer && scope){
                let linksArray = acc[key];
                if(!linksArray){
                    // If this is the first link for this layer, create the array
                    linksArray = [];
                }
                // Add to array and to acc object
                linksArray.push(new LayerSelectorLink(layer, scope));
                acc[key] = linksArray;
            }
            return acc;
        }, {} as LinksMap);
        return linksMap;
    }
    
    /**
     * Adds or replaces a link between a layer and a css scope.
     * 
     * This will cause views to update accordingly 
     * @param layer 
     * @param scope 
     */
    addLink(layer: FigmaLayer, scope: StylesheetScope) {
        // Create link
        let link = new LayerSelectorLink(layer, scope);
        // Persist it
        this.storage.addLink(link.ids);
        // Update views
        this.updateViewsWithLinks();
    }

    /**
     * Removes the link for a given layer
     * @param layer 
     */
    removeLayerLink(layer: FigmaLayer){
        this.storage.removeLayerLinks(layer);
        // Update views
        this.updateViewsWithLinks();
    }
    
    /**
     * Updates the views with the current links
     */
    updateViewsWithLinks(){
        // TODO
        // Update links manager view
        // this.createLinksManagerProvider(this.links);
        
        // // Update links in views
        // this.figmaLayerProvider.updateLinks(this.linksByLayer);
        // this.stylesheet.updateLinks(this.linksBySelector);
    }

    /**
     * Creates the provider for the links manager view
     * @param links 
     */
    createLinksManagerProvider(links?: LayerSelectorLink[]){
        vscode.window.createTreeView('linksManager', {
            treeDataProvider: new LinksManagerProvider(links),
            showCollapseAll: true
        });
    }


    /*===============
        STYLESHEET
    ================*/

    /**
     * Returns all available selectors
     */
    get selectors(): string[] {
        return this.stylesheet.getAllSelectors();
    }

    /**
     * 
     * @param fullSelector 
     */
	getScopeByFullSelector(fullSelector: string) {
		return this.stylesheet.getScope(fullSelector);
    }
    
    /**
     * Highlights a scope in the editor
     * @param scopeName 
     */
    highlightScopeByName(scopeName: string){
        let scope = this.stylesheet.getScope(scopeName);
        if(scope){
            let scopeRange = scope.getSelectorRange();
            this.editor.revealRange(scopeRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            this.editor.selection = new vscode.Selection(scopeRange.start, scopeRange.end);
        }
    }


    /*=====================================
        FIGMA FILE, COMPONENTS & SIDEBAR
    =======================================*/

    /**
     * Fetches all currently connected figma files from the server
     */
    public fetchAllFigmaFiles(): boolean {
        let keys = this.fileKeys;
        let ok = true;
        keys.forEach(key => {
            ok = ok && this.fetchFigmaFile(key);
        });
        return ok;
    }

    /**
     * Fetches a figma file and builds its FigmaFile cache
     */
    public fetchFigmaFile(fileKey: string): boolean{
        if(this.documentIsSetup){
            // Set status
            this.status = Status.SYNCING;
            const client = Figma.Client({ personalAccessToken: this.APIKey });
            client.file(fileKey).then(({ data }) => {
                // Retrieve cache if any
                let figmaFile = this.getFigmaFile(fileKey);

                // Check if the there is data and if it's is up to date. If not, parse received data.
                if(!figmaFile || data.lastModified !== figmaFile.lastModified){
                    // Store components
                    this.addFigmaFile(new FigmaFile(data, fileKey));
                }
                // Change status
                this.status = Status.SYNCED;

            }).catch(reason => {
                this.status = Status.ERROR;
                console.warn(reason);
                throw new Error('Something went wrong while fetching the data...');
            });

            // Request successfully submited
            return true;
        }

        // File not set up. 
        return false;
    }

    // /**
    //  * Updates the figma file
    //  * @param figmaFile 
    //  */
    // set figmaFile(figmaFile: FigmaFile){
    //     // Update internal representation of the figma file
    //     this.storage.figmaFile = figmaFile;
    //     
    // }

    // /**
    //  * Returns the figma file
    //  */
    // get figmaFile(): FigmaFile {
    //     return this.storage.figmaFile;
    // }

    get figmaFiles(): FigmaFile[] {
        return this.storage.figmaFiles;
    }

    /**
     * Adds a FigmaFile instance to the workspace state
     * @param figmaFile 
     */
    addFigmaFile(figmaFile: FigmaFile){
        this.storage.addFigmaFile(figmaFile);

        // Update treeview provider
        this.loadSidebar();
    }

    /**
     * Returns the file FigmaFile instance for the fileKey
     * @param fileKey 
     */
    getFigmaFile(fileKey: string): FigmaFile {
        return this.storage.getFigmaFile(fileKey);
    }

    /**
     * Updates the treeview with the current figma components
     */
    loadSidebar(){
        let provider = new FigmaLayerProvider(this.figmaFiles, this.ignoreInternalLayers);
        // Update internal representation
        this.sidebarProvider = provider;
        // Register the provider
        this.treeView = vscode.window.createTreeView('figmaComponents', {
            treeDataProvider: this.sidebarProvider,
            showCollapseAll: true
        });
    }

    /**
     * Reveals a layer in the sidebar by its ID
     * @param layerId 
     */
    revealLayerById(layerId: string){
        let figmaLayer = this.sidebarProvider.treeItems[layerId];
        if(figmaLayer){
            this.treeView.reveal(figmaLayer, {
                select: true,
                focus: false
            }).then(()=>{
                this.showCssProperties(figmaLayer);
            });
        }
    }

    /**
     * Returns a layer object by its ID
     * @param layerId 
     */
    getLayerById(layerId: string): FigmaLayer | undefined{
        let items = this.sidebarProvider.treeItems;
        if(layerId in items){
            return items[layerId];
        }
        return undefined;
    }

    /**
     * Displays the CSS properties for a layer in the Sidebar CSS Properties view
     * @param layer 
     */
    showCssProperties(layer: FigmaLayer){
        // PROBABLY REMOVE I'm not sure showing and hiding things is the best UX
        // Set context variable to show or hide the view
        // let selectedStyledItem = layer.hasStyles ? true : false;
        // vscode.commands.executeCommand("setContext", "selectedStyledItem", selectedStyledItem);
        
        // Create provider 
        this.createCssPropertiesProvider(layer.styles);
    }

    /**
     * Creates a the provider for the css properties view
     * @param styles
     */
    createCssPropertiesProvider(styles?: CssProperties){
        vscode.window.createTreeView('layerProperties', {
            treeDataProvider: new CssPropertiesProvider(styles)
        });
    }




    /*====================================
        FILE & EXTENSION SETUP, CONFIGs
    ======================================*/

    /**
     * Returns the filekey associated with this document
     */
    get fileKeys(): string[] {
        return this.storage.fileKeys;
    }

    /**
     * Returns the API key currently set in the configuration
     */
    get APIKey(): string | undefined {
        return this.config.get(APIKeyConfigName);
    }

    /**
     * Checks whether the document is setup to sync with a figma document
     */
    get documentIsSetup(): boolean {
        return this.fileKeys.length > 0 && this.APIKey !== undefined;
    }

    /**
     * Returns a boolean indicating whether internal layers should be ignored. Defaults to true.
     */
    get ignoreInternalLayers(): boolean {
        let ignore = this.config.get<boolean>(ignoreInternalLayersConfigName);
        return ignore ? ignore : false;
    }

    /**
     * Connects this workspace with a figma file
     */
    public connectFigmaFileKey(fileKey:string){
        // Persist this connection
        this.storage.addFileKey(fileKey);
        // Retrieve components
        this.fetchFigmaFile(fileKey);
    }

    /**
     * Deletes all local data for this file, thus disconnecting this file from a Figma file.
     */
    public detachFile(){
        // Delete data
        this.storage.clearData();
        // Dispose of view items
        this.dispose();
        // Reload the views
        this.load();
    }


    /**
     * Sets the status of the extension. This will be reflected in the status bar
     */
    set status(status: Status){
        // Create boilerplate function for showing the status bar with a message and command
        let showStatusBar = (text:string, command?:string) => {
            if(command){
                WorkspaceState.statusBar.command = command;
            }
            WorkspaceState.statusBar.text = text;
            WorkspaceState.statusBar.show();
        };

        switch(status){
            case Status.NOT_ATTACHED:
                showStatusBar(`$(circle-slash) Not connected to Figma`, 'figmasync.syncLessFile');
                break;
            case Status.SYNCING:
                showStatusBar('$(repo-sync) Syncing with api.figma.com');
                break;
                case Status.SYNCED:
                showStatusBar(`$(check) Connected with Figma`, 'figmasync.removeFigmaSync');
                break;
            case Status.ERROR:
                showStatusBar(`$(alert) Something went wrong...`, 'figmasync.syncLessFile');
            default:
                WorkspaceState.statusBar.hide();
        }
    }
    
    /**
     * Returns a suggested status based on the current state of persistent components and language ID
     */
    getDefaultStatus(): Status {
        if(!supportedLanguages.includes(this.editor.document.languageId)){
            return Status.UNSUPPORTED;
        }
        if(this.documentIsSetup) {
            return Status.SYNCED;
        }
        return Status.NOT_ATTACHED;
    }

}