import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { FileStorage, LinksMap } from './util/storage';
import { Stylesheet } from './util/stylesheet';
import { FigmaFile } from './figma-components';
import { FigmaLayerProvider } from './figmalayer';

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
    
    // File state properties
	private fileData: FileStorage; // for persisting and retrieving data
	private stylesheet: Stylesheet; // Represents the style scopes in the current file
	private links: LinksMap; // Map between selectors <-> layers
    private _figmaLayerProvider!: FigmaLayerProvider; // Represents and manipulates all FigmaLayer instances

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
        
        // Load persisted data
		this.fileData = new FileStorage(this.uri.path, this.context);
		this.links = this.fileData.links;
		this.figmaFile = this.fileData.components;
		
		// Instantiate view managers
		this.stylesheet = new Stylesheet(this.editor, this.context);
        this.figmaLayerProvider = new FigmaLayerProvider(this.figmaFile);

        // Set initial status
        this.status = this.status; // This looks really weird, but there are getter and setter functions for these
    }


    /*=============================
        FIGMA FILE & COMPONENTS
    ==============================*/

    /**
     * Fetches the figma file
     */
    private retrieveFigmaFile(){
        if(this.fileKey && this.APIKey){
            // Set status
            this.status = Status.SYNCING;
            const client = Figma.Client({ personalAccessToken: this.APIKey });
            client.file(this.fileKey).then(({ data }) => {
                // Change status
                this.status = Status.SYNCED;
                
                // Retrieve cache if any
                let figmaFile = this.figmaFile;
                
                // Check if the there is data and if it's is up to date. If not, parse received data.
                if(!figmaFile || data.lastModified !== figmaFile.lastModified){
                    // Parse document
                    figmaFile = new FigmaFile(data);
                    // Store components
                    this.figmaFile = figmaFile;
                }
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
        this.fileData.components = figmaFile;
        // Update treeview provider
        this.figmaLayerProvider = new FigmaLayerProvider(figmaFile);
    }

    get figmaFile(): FigmaFile {
        return this.fileData.components;
    }

    /**
     * Updates the treeview with the new data
     */
    set figmaLayerProvider(provider: FigmaLayerProvider){
        // Update internal representation
        this._figmaLayerProvider = provider;
        // Register the provider
        vscode.window.registerTreeDataProvider('figmaComponents', this._figmaLayerProvider);
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
        return this.fileData.fileKey;
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
        this.fileData.fileKey = fileKey;
        // Retrieve components
        this.retrieveFigmaFile();
    }

    /**
     * Deletes all local data for this file, thus disconnecting this file from a Figma file.
     */
    public detachFile(){
        this.fileData.clearData();
    }

    /**
     * Sets the status of the extension. This will be reflected in the status bar
     */
    set status(status: Status){
        switch(status){
            case Status.NOT_ATTACHED:
                FileState.statusBar.text = `$(circle-slash) Not connected to Figma`;
                FileState.statusBar.command = 'figmasync.syncLessFile';
                FileState.statusBar.show();
                break;
            case Status.SYNCING:
                FileState.statusBar.text = '$(repo-sync) Syncing with api.figma.com';
                FileState.statusBar.show();
                break;
            case Status.SYNCED:
                FileState.statusBar.text = `$(check) Figma: ${this.fileData.fileName}`;
                FileState.statusBar.command = 'figmasync.removeFigmaSync';
                FileState.statusBar.show();
                break;
            case Status.ERROR:
                FileState.statusBar.text = `$(alert) Something went wrong...`;
                FileState.statusBar.command = 'figmasync.syncLessFile';
                FileState.statusBar.show();
            default:
                FileState.statusBar.hide();
        }
    }
    
    /**
     * Returns a suggested status based on the current state of persistent components and language ID
     */
    get status(): Status {
        if(!supportedLanguages.includes(this.editor.document.languageId)){
            return Status.UNSUPPORTED;
        }
        if(this.fileName) {
            return Status.SYNCED;
        }
        return Status.NOT_ATTACHED;

    }

}