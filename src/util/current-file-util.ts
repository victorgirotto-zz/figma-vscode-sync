import * as vscode from 'vscode';

export class CurrentFileUtil {

	/**
	 * Returns the currently open file
	 */
	static getCurrentFile(){
		return vscode.window.activeTextEditor;
	}

    /**
	 * Returns the URI path for the currently open file
	 */
	static getOpenFileURIPath(){
		const openFile = vscode.window.activeTextEditor;
		if(openFile){
			return openFile.document.uri.path;
		}
		return undefined;
	}

	/**
	 * Returns the currently open file's language ID
	 */
	static getFileLanguageID(){
		const openFile = vscode.window.activeTextEditor;
		if(openFile){
			return openFile.document.languageId;
		}
		return;
	}

	/**
	 * Returns whether the current file is of a certain kind
	 * @param id Language ID for comparison
	 */
	static isFileLanguageID(id: string){
		return this.getFileLanguageID() === id;
	}

	/**
	 * Gets a line from the an editor.
	 * @param editor An editor instance
	 * @param line Desired line number
	 */
	static getLine(editor: vscode.TextEditor, line: number): vscode.TextLine {
		return editor.document.lineAt(line);
	}
}