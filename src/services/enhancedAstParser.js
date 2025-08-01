const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs').promises;
const path = require('path');

/**
 * Enhanced AST-based code chunking
 * Extracts code chunks with rich metadata about functions, classes, and their relationships
 */
class EnhancedAstParser {
    constructor() {
        this.parseOptions = {
            sourceType: 'module',
            plugins: [
                'jsx',
                'typescript',
                'classProperties',
                'decorators-legacy',
                'exportDefaultFrom',
                'doExpressions',
                'objectRestSpread',
                'asyncGenerators',
                'functionBind',
                'functionSent',
                'dynamicImport',
                'optionalChaining',
                'nullishCoalescingOperator'
            ]
        };
    }

    /**
     * Extracts imports and their relationships
     * @param {Object} ast - The parsed AST
     * @returns {Array} Import information
     */
    extractImports(ast) {
        const imports = [];
        traverse(ast, {
            ImportDeclaration(path) {
                imports.push({
                    source: path.node.source.value,
                    specifiers: path.node.specifiers.map(spec => ({
                        type: spec.type,
                        local: spec.local.name,
                        imported: spec.imported ? spec.imported.name : null
                    }))
                });
            }
        });
        return imports;
    }

    /**
     * Extracts function metadata including parameters, return type, and JSDoc
     * @param {Object} node - AST node
     * @returns {Object} Function metadata
     */
    extractFunctionMetadata(node) {
        const params = node.params.map(param => ({
            name: param.name,
            type: param.typeAnnotation ? param.typeAnnotation.typeAnnotation.type : null
        }));

        // Extract JSDoc comment if present
        let jsDoc = null;
        if (node.leadingComments) {
            const docComment = node.leadingComments.find(comment => 
                comment.type === 'CommentBlock' && comment.value.startsWith('*')
            );
            if (docComment) {
                jsDoc = docComment.value.trim();
            }
        }

        return {
            name: node.id ? node.id.name : 'anonymous',
            params,
            async: node.async,
            generator: node.generator,
            returnType: node.returnType ? node.returnType.typeAnnotation.type : null,
            jsDoc
        };
    }

    /**
     * Extracts class metadata including methods and properties
     * @param {Object} node - AST node
     * @returns {Object} Class metadata
     */
    extractClassMetadata(node) {
        const methods = [];
        const properties = [];

        for (const classElement of node.body.body) {
            if (classElement.type === 'ClassMethod') {
                methods.push(this.extractFunctionMetadata(classElement));
            } else if (classElement.type === 'ClassProperty') {
                properties.push({
                    name: classElement.key.name,
                    type: classElement.typeAnnotation ? classElement.typeAnnotation.typeAnnotation.type : null,
                    static: classElement.static,
                    private: classElement.private
                });
            }
        }

        return {
            name: node.id.name,
            superClass: node.superClass ? node.superClass.name : null,
            methods,
            properties
        };
    }

    /**
     * Creates a chunk from a node with enhanced metadata
     * @param {Object} node - AST node
     * @param {string} code - Source code
     * @param {string} filePath - Path to the file
     * @returns {Object} Code chunk with metadata
     */
    createChunk(node, code, filePath) {
        const start = node.start;
        const end = node.end;
        const content = code.slice(start, end);

        const chunk = {
            id: `${filePath}:${start}-${end}`,
            content,
            metadata: {
                file_path: filePath,
                type: node.type,
                line_start: node.loc.start.line,
                line_end: node.loc.end.line,
                name: node.id ? node.id.name : null
            }
        };

        // Add enhanced metadata based on node type
        if (node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression') {
            chunk.metadata.function = this.extractFunctionMetadata(node);
        } else if (node.type === 'ClassDeclaration') {
            chunk.metadata.class = this.extractClassMetadata(node);
        }

        return chunk;
    }

    /**
     * Parses a file and extracts enhanced code chunks
     * @param {string} filePath - Path to the file
     * @returns {Promise<Array>} Array of code chunks with metadata
     */
    async parseFile(filePath) {
        try {
            const code = await fs.readFile(filePath, 'utf-8');
            const ast = parser.parse(code, this.parseOptions);
            const chunks = [];
            const imports = this.extractImports(ast);

            traverse(ast, {
                enter: (path) => {
                    if (
                        path.node.type === 'FunctionDeclaration' ||
                        path.node.type === 'ClassDeclaration' ||
                        (path.node.type === 'VariableDeclaration' &&
                         path.node.declarations[0].init &&
                         path.node.declarations[0].init.type === 'ArrowFunctionExpression')
                    ) {
                        const chunk = this.createChunk(path.node, code, filePath);
                        chunk.metadata.imports = imports;
                        chunks.push(chunk);
                    }
                }
            });

            return chunks;
        } catch (error) {
            console.error(`Error parsing file ${filePath}:`, error);
            return [];
        }
    }
}

module.exports = new EnhancedAstParser();