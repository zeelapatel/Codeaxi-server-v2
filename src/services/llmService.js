const { OpenAI } = require('openai');
const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');

// Initialize OpenAI client
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
});

/**
 * Handles errors from OpenAI API calls
 * @param {Error} error - The error from OpenAI
 * @throws {Error} Rethrows the error with appropriate handling
 */
function handleOpenAIError(error) {
    console.error('OpenAI API Error Details:', {
        status: error.status,
        type: error.error?.type,
        code: error.error?.code,
        message: error.message,
        requestId: error.requestId
    });
    
    if (error.error?.type === 'insufficient_quota') {
        const quotaError = new Error('Documentation service temporarily unavailable due to API quota limits.');
        quotaError.code = 'QUOTA_EXCEEDED';
        quotaError.details = {
            type: error.error?.type,
            code: error.error?.code
        };
        throw quotaError;
    }
    
    if (error.status === 429) {
        const rateError = new Error('Too many requests. Please try again in a few moments.');
        rateError.code = 'RATE_LIMIT';
        throw rateError;
    }

    throw error;
}

/**
 * Creates a Word document section for an API endpoint
 * @param {Object} endpoint - The endpoint information
 * @returns {Array} Array of document elements (paragraphs, tables, etc.)
 */
function createEndpointSection(endpoint) {
    const elements = [];
    
    // Endpoint title
    elements.push(new Paragraph({
        text: endpoint.name,
        heading: HeadingLevel.HEADING_2
    }));

    // Method and URL
    elements.push(new Paragraph({
        children: [
            new TextRun({ text: endpoint.method + " ", bold: true }),
            new TextRun(endpoint.url)
        ]
    }));

    // Description
    if (endpoint.description) {
        elements.push(new Paragraph({
            text: endpoint.description
        }));
    }

    // Parameters table if there are any
    if (endpoint.parameters && endpoint.parameters.length > 0) {
        const table = new Table({
            width: {
                size: 100,
                type: WidthType.PERCENTAGE,
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph("Parameter")] }),
                        new TableCell({ children: [new Paragraph("Type")] }),
                        new TableCell({ children: [new Paragraph("Description")] })
                    ]
                }),
                ...endpoint.parameters.map(param => 
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph(param.name)] }),
                            new TableCell({ children: [new Paragraph(param.type)] }),
                            new TableCell({ children: [new Paragraph(param.description)] })
                        ]
                    })
                )
            ]
        });
        elements.push(table);
    }

    return elements;
}

/**
 * Generates documentation using OpenAI's GPT model
 * @param {string} codeContext - The code context to generate documentation for
 * @returns {Promise<Document>} The generated Word document
 */
async function generateDocumentationWithLLM(codeContext) {
    const systemPrompt = `You are a technical writer. Create clear API docs focusing on endpoints, params, examples, and errors.`;

    const userPrompt = `Create API docs from this code:

${codeContext}

Return JSON with sections: Overview, Auth, Endpoints (with params/examples), Errors.`;

    try {
        console.log(`[LLM] Starting final documentation generation`);
        console.time(`[LLM] Final documentation time`);

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-16k",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            temperature: 0.1,
            max_tokens: 16000,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            response_format: { type: "json_object" }
        });

        console.timeEnd(`[LLM] Final documentation time`);

        const docContent = JSON.parse(completion.choices[0].message.content.trim());
        console.log(`[LLM] Generated final documentation with sections:
  - Overview: ${docContent.overview ? docContent.overview.substring(0, 50) + '...' : 'N/A'}
  - Auth: ${docContent.authentication ? 'Present' : 'N/A'}
  - Endpoints: ${docContent.endpoints ? docContent.endpoints.length : 0} endpoints
  - Error Handling: ${docContent.errorHandling ? 'Present' : 'N/A'}`);

        // Create Word document
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    // Title
                    new Paragraph({
                        text: "API Documentation",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER
                    }),

                    // Overview
                    new Paragraph({
                        text: "Overview",
                        heading: HeadingLevel.HEADING_1
                    }),
                    new Paragraph({
                        text: docContent.overview || "No overview provided."
                    }),

                    // Authentication
                    new Paragraph({
                        text: "Authentication",
                        heading: HeadingLevel.HEADING_1
                    }),
                    new Paragraph({
                        text: docContent.authentication || "No authentication details provided."
                    }),

                    // Endpoints
                    new Paragraph({
                        text: "API Endpoints",
                        heading: HeadingLevel.HEADING_1
                    }),
                    ...(docContent.endpoints || []).flatMap(endpoint => createEndpointSection(endpoint)),

                    // Error Handling
                    new Paragraph({
                        text: "Error Handling",
                        heading: HeadingLevel.HEADING_1
                    }),
                    new Paragraph({
                        text: docContent.errorHandling || "No error handling information provided."
                    })
                ]
            }]
        });

        return doc;
    } catch (error) {
        handleOpenAIError(error);
    }
}

module.exports = {
    generateDocumentationWithLLM
};