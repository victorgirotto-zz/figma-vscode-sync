import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { FileStorage } from './util/storage';
import { Stylesheet, StylesheetScope } from './util/stylesheet';
import { FigmaFile } from './figmafile';
import { FigmaLayerProvider, FigmaLayer } from './figmalayer';
import { LayerSelectorLink, LinksMap } from './link';

const supportedLanguages = ['less']; // List of supported file types
const APIKeyConfigName = 'APIKey';

enum Status {
    SYNCING, // Waiting for data from Figma
    SYNCED, // Synced with Figma and ready
    NOT_ATTACHED, // Supported file, but not attached 
    UNSUPPORTED, // Unsupported file
    ERROR // Somethign went wrong
}

/**
 * Represents and manipulates everything related to the state of the currently open file
 */
export class FileState {
    static statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

    // VSCode properties
    private editor: vscode.TextEditor;
    private context: vscode.ExtensionContext;
    private uri: vscode.Uri;
    private config: vscode.WorkspaceConfiguration;
    
    // Persisted properties API
    private storage!: FileStorage; // for persisting and retrieving data
    
    // View managers
	private stylesheet!: Stylesheet; // Represents the style scopes in the current file
    private _figmaLayerProvider!: FigmaLayerProvider; // Represents and manipulates all FigmaLayer instances
    private treeView!: vscode.TreeView<FigmaLayer>;

	/**
	 * 
	 * @param editor Currently open editor
	 * @param context extension context
	 */
	constructor(editor: vscode.TextEditor, context: vscode.ExtensionContext){
        // Set vscode properties
        this.editor = editor;
        this.context = context;
        this.uri = this.editor.document.uri;
        this.config = vscode.workspace.getConfiguration();
        // Load from storage
        this.load();
    }

    /**
     * Based on the vscode properties, loads data from storage and sets up the views
     */
    load() {
        // Load persisted data
		this.storage = new FileStorage(this.uri.path, this.context);
        this.figmaFile = this.storage.components;
        
        // Check for updates on server if a file is connected
        if(this.figmaFile){
            this.fetchAPIData();
        }
		
		// Instantiate view managers
		this.stylesheet = new Stylesheet(this.editor, this.linksBySelector);

        // Set initial status
        this.status = this.getDefaultStatus();
    }

    /**
     * Removes any lingering elements from the screen
     */
    dispose(){
        // Remove decorations
        this.stylesheet.clearDecorations();
    }


    /*==========
        LINKS
    ============*/

    /**
     * 
     */
    get linksByLayer(): LinksMap{
        return this.storage.getLinksByLayer();
    }
    
    /**
     * 
     */
    get linksBySelector(): LinksMap{
        return this.storage.getLinksBySelector();
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
        this.storage.addLinkByLayer(link);
        // Update views
        this.updateViewsWithLinks();
    }

    /**
     * Removes the link for a given layer
     * @param layer 
     */
    removeLayerLink(layer: FigmaLayer){
        this.storage.removeLinkByLayer(layer);
        // Update views
        this.updateViewsWithLinks();
    }
    
    /**
     * Updates the views with the current links
     */
    updateViewsWithLinks(){
        this.figmaLayerProvider.updateLinks(this.linksByLayer);
        this.stylesheet.updateLinks(this.linksBySelector);
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


    /*=====================================
        FIGMA FILE, COMPONENTS & SIDEBAR
    =======================================*/

    /**
     * Fetches the figma file
     */
    private fetchAPIData(){
        if(this.fileKey && this.APIKey){
            // Set status
            this.status = Status.SYNCING;
            const client = Figma.Client({ personalAccessToken: this.APIKey });
            client.file(this.fileKey).then(({ data }) => {
                // Retrieve cache if any
                let figmaFile = this.figmaFile;
                
                // Check if the there is data and if it's is up to date. If not, parse received data.
                if(!figmaFile || data.lastModified !== figmaFile.lastModified){
                    // Parse document
                    figmaFile = new FigmaFile(data);
                    // Store components
                    this.figmaFile = figmaFile;
                }

                // Change status
                this.status = Status.SYNCED;
            }).catch(reason => {
                this.status = Status.ERROR;
                throw new Error('Something went wrong while fetching the data...');
            });
        } else {
            // Update status
            this.status = Status.ERROR;
            throw new Error('Either the fileKey or the APIKey are not set');
        }
    }

    /**
     * Updates the figma file
     * @param figmaFile 
     */
    set figmaFile(figmaFile: FigmaFile){
        // Update internal representation of the figma file
        this.storage.components = figmaFile;
        // Update treeview provider
        this.figmaLayerProvider = new FigmaLayerProvider(figmaFile, this.linksByLayer);
    }

    /**
     * Returns the figma file
     */
    get figmaFile(): FigmaFile {
        return this.storage.components;
    }

    /**
     * Updates the treeview with the new data
     */
    set figmaLayerProvider(provider: FigmaLayerProvider){
        // Update internal representation
        this._figmaLayerProvider = provider;
        // Register the provider
        this.treeView = vscode.window.createTreeView('figmaComponents', {
            treeDataProvider: this._figmaLayerProvider
        });
    }

    /**
     * Returns the current layer provider
     */
    get figmaLayerProvider(): FigmaLayerProvider {
        return this._figmaLayerProvider;
    }

    /**
     * Reveals a layer in the sidebar by its ID
     * @param layerId 
     */
    revealLayerById(layerId: string){
        let figmaLayer = this.figmaLayerProvider.treeItems[layerId];
        if(figmaLayer){
            this.treeView.reveal(figmaLayer);
        }
    }


    /*============================
        FILE & EXTENSION SETUP
    ==============================*/
    
    get fileName(): string | undefined {
        if(!this.figmaFile){
            return undefined;
        }
        return this.figmaFile.name;
    }

    /**
     * Returns the filekey associated with this document
     */
    get fileKey(): string | undefined {
        return this.storage.fileKey;
    }

    /**
     * Returns the API key currently set in the configuration
     */
    get APIKey(): string | undefined {
        return this.config.get(APIKeyConfigName);
    }

    /**
     * Attaches a file to this document
     */
    public attachFile(fileKey:string){
        // Persist this connection
        this.storage.fileKey = fileKey;
        // Retrieve components
        this.fetchAPIData();
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
        let showStatusBar = (text:string, command?:string) => {
            if(command){
                FileState.statusBar.command = command;
            }
            FileState.statusBar.text = text;
            FileState.statusBar.show();
        };

        switch(status){
            case Status.NOT_ATTACHED:
                showStatusBar(`$(circle-slash) Not connected to Figma`, 'figmasync.syncLessFile');
                break;
            case Status.SYNCING:
                showStatusBar('$(repo-sync) Syncing with api.figma.com');
                break;
            case Status.SYNCED:
                showStatusBar(`$(check) Figma: ${this.fileName}`, 'figmasync.removeFigmaSync');
                break;
            case Status.ERROR:
                showStatusBar(`$(alert) Something went wrong...`, 'figmasync.syncLessFile');
            default:
                FileState.statusBar.hide();
        }
    }
    
    /**
     * Returns a suggested status based on the current state of persistent components and language ID
     */
    getDefaultStatus(): Status {
        if(!supportedLanguages.includes(this.editor.document.languageId)){
            return Status.UNSUPPORTED;
        }
        if(this.fileName) {
            return Status.SYNCED;
        }
        return Status.NOT_ATTACHED;
    }

}