// src/languageParsers.js
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const fs = require('fs');
const path = require('path');

// Map file extensions to language parsers and names
const languageMap = {
    '.js': { parser: JavaScript, name: 'javascript' },
    '.jsx': { parser: JavaScript, name: 'javascript' }, // JSX is typically parsed by JS parser with plugins
    '.ts': { parser: JavaScript, name: 'typescript' },   // TypeScript is often parsed by JS parser
    '.tsx': { parser: JavaScript, name: 'typescript' }, // TSX is parsed similarly
    '.py': { parser: Python, name: 'python' },
    '.java': { parser: Java, name: 'java' },
    
};

const parserCache = {}; // Cache parsers for efficiency

/**
 * Determines the language based on file extension and returns the appropriate tree-sitter parser.
 * @param {string} filePath - The path to the file.
 * @returns {{parser: Parser, langName: string} | null} The parser instance and language name, or null if not supported.
 */
function getLanguageParser(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langInfo = languageMap[ext];

    if (!langInfo) {
        // console.warn(`Unsupported file extension: ${ext} for ${filePath}`);
        return null;
    }

    if (!parserCache[langInfo.name]) {
        const parser = new Parser();
        parser.setLanguage(langInfo.parser);
        parserCache[langInfo.name] = parser;
    }
    return { parser: parserCache[langInfo.name], langName: langInfo.name };
}

/**
 * Extracts meaningful code chunks from a file using an AST parser.
 * @param {string} filePath - The path to the code file.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of code chunks, each with content and rich metadata.
 */
async function getCodeChunks(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const langParserInfo = getLanguageParser(filePath);

    if (!langParserInfo) {
        return []; // Skip unsupported files
    }

    const { parser, langName } = langParserInfo;
    const tree = parser.parse(fileContent);
    const chunks = [];
    let chunkIdCounter = 0;

    // --- Language-Specific Node Type Mappings for Chunking ---
    // These are common top-level declarations that make good semantic chunks.
    // Extend this as needed for more granular or specific chunking requirements.
    const relevantNodeTypes = {
        'javascript': new Set([
            'function_declaration', // function foo() {}
            'arrow_function',       // const foo = () => {}
            'function',             // function expression
            'class_declaration',    // class MyClass {}
            'lexical_declaration',  // const/let/var, often for function expressions or important constants
            'variable_declaration', // for `var` declarations
            'export_statement',     // export ...
            'import_statement',     // import ...
        ]),
        'typescript': new Set([ // TypeScript often shares JS structure but adds interfaces, types, etc.
            'function_declaration',
            'arrow_function',
            'function',
            'class_declaration',
            'lexical_declaration',
            'variable_declaration',
            'export_statement',
            'import_statement',
            'interface_declaration', // interface MyInterface {}
            'type_alias_declaration', // type MyType = {}
            'enum_declaration',       // enum MyEnum {}
        ]),
        'python': new Set([
            'function_definition',  // def my_func():
            'class_definition',     // class MyClass:
            'decorated_definition', // @decorator def my_func():
            'import_statement',     // import module
            'import_from_statement',// from module import name
            'expression_statement', // Can capture top-level assignments/calls if desired, be careful
        ]),
        'java': new Set([
            'class_declaration',    // class MyClass {}
            'interface_declaration',// interface MyInterface {}
            'enum_declaration',     // enum MyEnum {}
            'method_declaration',   // public void myMethod() {}
            'constructor_declaration',// public MyClass() {}
            'import_declaration',   // import java.util.List;
            'package_declaration',  // package com.example;
            'field_declaration',    // private String myField; (for top-level fields)
        ]),
        // Add relevant node types for other languages
    };

    // A generic AST traversal function for common patterns
    function traverseAndChunk(node) {
        if (!node) return;

        // Check if this node type is relevant for the current language
        if (relevantNodeTypes[langName]?.has(node.type)) {
            const chunkContent = fileContent.substring(node.startIndex, node.endIndex);

            // Basic attempt to get a name for the chunk
            let name = 'anonymous';
            let specificType = node.type; // Default to AST node type

            // More specific naming based on common node patterns
            if (node.type === 'function_declaration' || node.type === 'function_definition' || node.type === 'method_declaration') {
                const identifierNode = node.childForFieldName('name') || node.childForFieldName('id');
                if (identifierNode) {
                    name = fileContent.substring(identifierNode.startIndex, identifierNode.endIndex);
                }
                specificType = 'function';
            } else if (node.type === 'class_declaration' || node.type === 'class_definition' || node.type === 'interface_declaration' || node.type === 'enum_declaration') {
                const identifierNode = node.childForFieldName('name') || node.childForFieldName('id');
                if (identifierNode) {
                    name = fileContent.substring(identifierNode.startIndex, identifierNode.endIndex);
                }
                specificType = node.type.replace(/_declaration|_definition/, ''); // e.g., 'class', 'interface'
            } else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
                // For variable declarations, check if it's a function expression
                const declaratorNode = node.children.find(child => child.type === 'variable_declarator');
                if (declaratorNode) {
                    const idNode = declaratorNode.childForFieldName('name');
                    const valueNode = declaratorNode.childForFieldName('value');
                    if (idNode) {
                        name = fileContent.substring(idNode.startIndex, idNode.endIndex);
                    }
                    if (valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
                        specificType = 'function_expression';
                    } else {
                        specificType = 'variable';
                    }
                }
            } else if (node.type === 'export_statement' || node.type === 'import_statement' || node.type === 'import_from_statement') {
                specificType = node.type.replace(/_statement/, ''); // e.g., 'export', 'import'
                name = specificType; // Name it by its type for simplicity
            } else if (node.type === 'field_declaration') { // Java field
                 const varDeclaratorNode = node.childForFieldName('declarator'); // Assuming single declarator
                 if (varDeclaratorNode) {
                     const idNode = varDeclaratorNode.childForFieldName('name');
                     if (idNode) {
                         name = fileContent.substring(idNode.startIndex, idNode.endIndex);
                     }
                 }
                 specificType = 'field';
            } else if (node.type === 'package_declaration') {
                 const nameNode = node.childForFieldName('name');
                 if (nameNode) name = fileContent.substring(nameNode.startIndex, nameNode.endIndex);
                 specificType = 'package';
            }


            chunks.push({
                id: `${langName}_${specificType}_${name}_${path.basename(filePath)}_${chunkIdCounter++}`,
                content: chunkContent,
                metadata: {
                    file_path: filePath,
                    language: langName,
                    type: specificType, // More user-friendly type
                    name: name,
                    line_start: node.startPosition.row + 1, // tree-sitter is 0-indexed for rows
                    line_end: node.endPosition.row + 1,
                    // Add parent_type or other contextual info if beneficial for specific use cases
                    // parent_type: node.parent?.type || 'root', // Might be useful but adds complexity
                },
            });

            // IMPORTANT: If we chunked this node as a top-level unit, we prevent its children
            // from being processed as separate top-level chunks to avoid redundancy.
            // This assumes we want functions/classes as single chunks.
            return;
        }

        // Recursively traverse children for other types of nodes that are not top-level chunks themselves
        // but might contain relevant nested structures or simple statements.
        // For very large chunk types (e.g., a massive function body), you might
        // apply a secondary character-based splitter *here* before adding to chunks.
        for (const child of node.children) {
            traverseAndChunk(child);
        }
    }

    // Start traversal from the root of the AST
    traverseAndChunk(tree.rootNode);

    // Optional: Sort chunks by line number for consistent ordering
    chunks.sort((a, b) => a.metadata.line_start - b.metadata.line_start);

    return chunks;
}

module.exports = {
    getCodeChunks
};