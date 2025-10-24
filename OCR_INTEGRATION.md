# DeepSeek-OCR Integration

The aaIaaS.ai platform now includes advanced OCR capabilities powered by **DeepSeek-OCR**, a state-of-the-art vision-language model for optical character recognition and document understanding.

## Overview

DeepSeek-OCR provides context-aware optical compression and visual-text understanding, enabling the platform to process documents, images, charts, and PDFs with high accuracy and structural awareness.

## Features

### 1. Free OCR
Extract text from images without layout information. Ideal for simple text extraction tasks.

**Use Cases:**
- Extract text from photos
- Digitize handwritten notes
- Quick text capture from screenshots

**API Endpoint:** `POST /api/v1/ocr`

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_image_here",
    "mode": "free_ocr",
    "base_size": 1024
  }'
```

### 2. Document to Markdown
Convert document images to structured markdown format, preserving headings, paragraphs, lists, and formatting.

**Use Cases:**
- Digitize printed documents
- Convert scanned PDFs to editable text
- Archive physical documents

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_document",
    "mode": "document_to_markdown",
    "base_size": 1024,
    "crop_mode": true
  }'
```

### 3. Grounded OCR
Extract text with layout information including bounding boxes and structural elements.

**Use Cases:**
- Form processing
- Invoice extraction
- Layout-aware document analysis

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_form",
    "mode": "grounded_ocr",
    "base_size": 1024
  }'
```

### 4. Parse Figure
Extract data and information from charts, graphs, diagrams, and visualizations.

**Use Cases:**
- Data extraction from charts
- Graph digitization
- Diagram understanding

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_chart",
    "mode": "parse_figure",
    "base_size": 1024
  }'
```

### 5. Describe Image
Generate detailed descriptions of images for accessibility, cataloging, and understanding.

**Use Cases:**
- Image captioning
- Accessibility features
- Content moderation
- Visual search

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_photo",
    "mode": "describe_image",
    "base_size": 1024
  }'
```

## File Upload Support

Upload images directly instead of using base64 encoding.

**Endpoint:** `POST /api/v1/ocr/upload`

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@document.jpg" \
  -F "mode=document_to_markdown" \
  -F "base_size=1024"
```

## Batch Processing

Process multiple images in a single request for efficiency.

**Endpoint:** `POST /api/v1/ocr/batch`

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr/batch \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "images": [
      "base64_image_1",
      "base64_image_2",
      "base64_image_3"
    ],
    "mode": "free_ocr",
    "base_size": 1024
  }'
```

**Response:**
```json
{
  "results": [
    {"text": "...", "status": "success"},
    {"text": "...", "status": "success"},
    {"text": "...", "status": "success"}
  ],
  "total": 3,
  "successful": 3,
  "failed": 0,
  "mode": "free_ocr"
}
```

## PDF Processing

Convert entire PDF documents to markdown.

**Endpoint:** `POST /api/v1/ocr/pdf`

**Example:**
```bash
curl -X POST https://api.aaiaas.ai/api/v1/ocr/pdf \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@document.pdf"
```

**Response:**
```json
{
  "filename": "document.pdf",
  "result": {
    "markdown": "# Page 1\n\nContent...\n\n# Page 2\n\nMore content...",
    "pages": 2,
    "mode": "pdf_to_markdown",
    "status": "success"
  },
  "status": "success"
}
```

## Supported Resolutions

DeepSeek-OCR supports multiple resolution modes for different use cases:

| Mode | Resolution | Vision Tokens | Use Case |
|------|-----------|---------------|----------|
| Tiny | 512×512 | 64 | Quick scans, low-detail images |
| Small | 640×640 | 100 | Standard documents |
| Base | 1024×1024 | 256 | High-quality documents (default) |
| Large | 1280×1280 | 400 | Complex layouts, fine details |

**Example with different resolutions:**
```bash
# Low resolution for quick processing
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"image": "...", "mode": "free_ocr", "base_size": 512}'

# High resolution for detailed documents
curl -X POST https://api.aaiaas.ai/api/v1/ocr \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"image": "...", "mode": "free_ocr", "base_size": 1280}'
```

## Supported Formats

- **Images:** JPEG, PNG, WEBP, BMP, GIF
- **Documents:** PDF (converted to images internally)
- **Input Methods:** Base64 encoding, file upload, direct bytes

## Capabilities Endpoint

Get information about OCR service capabilities.

**Endpoint:** `GET /api/v1/ocr/capabilities`

**Example:**
```bash
curl -X GET https://api.aaiaas.ai/api/v1/ocr/capabilities \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "service": "DeepSeek-OCR",
  "version": "1.0",
  "modes": {
    "free_ocr": {
      "description": "Extract text without layout information",
      "use_case": "Simple text extraction"
    },
    "document_to_markdown": {
      "description": "Convert documents to markdown format",
      "use_case": "Document digitization with structure"
    },
    "grounded_ocr": {
      "description": "Extract text with layout and bounding boxes",
      "use_case": "Structured document analysis"
    },
    "parse_figure": {
      "description": "Parse charts, graphs, and diagrams",
      "use_case": "Data extraction from visualizations"
    },
    "describe_image": {
      "description": "Generate detailed image descriptions",
      "use_case": "Image understanding and captioning"
    }
  },
  "supported_resolutions": {
    "tiny": "512x512 (64 vision tokens)",
    "small": "640x640 (100 vision tokens)",
    "base": "1024x1024 (256 vision tokens)",
    "large": "1280x1280 (400 vision tokens)"
  },
  "supported_formats": ["JPEG", "PNG", "PDF", "WEBP"],
  "max_file_size": "10MB",
  "batch_limit": 100
}
```

## Python SDK Example

```python
import requests
import base64

class OCRClient:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.aaiaas.ai/api/v1"
    
    def ocr_image(self, image_path, mode="free_ocr", base_size=1024):
        # Read and encode image
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()
        
        response = requests.post(
            f"{self.base_url}/ocr",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "image": image_data,
                "mode": mode,
                "base_size": base_size
            }
        )
        return response.json()
    
    def ocr_upload(self, image_path, mode="free_ocr"):
        with open(image_path, "rb") as f:
            files = {"file": f}
            data = {"mode": mode, "base_size": 1024}
            response = requests.post(
                f"{self.base_url}/ocr/upload",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files=files,
                data=data
            )
        return response.json()
    
    def pdf_to_markdown(self, pdf_path):
        with open(pdf_path, "rb") as f:
            files = {"file": f}
            response = requests.post(
                f"{self.base_url}/ocr/pdf",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files=files
            )
        return response.json()

# Usage
client = OCRClient("your_api_key")

# Free OCR
result = client.ocr_image("document.jpg", mode="free_ocr")
print(result["result"]["text"])

# Document to markdown
result = client.ocr_image("invoice.png", mode="document_to_markdown")
print(result["result"]["markdown"])

# PDF conversion
result = client.pdf_to_markdown("report.pdf")
print(result["result"]["markdown"])
```

## TypeScript SDK Example

```typescript
class OCRClient {
  private apiKey: string;
  private baseUrl: string = "https://api.aaiaas.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async ocrImage(imagePath: string, mode: string = "free_ocr", baseSize: number = 1024) {
    const fs = require("fs");
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString("base64");

    const response = await fetch(`${this.baseUrl}/ocr`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: imageBase64,
        mode: mode,
        base_size: baseSize
      })
    });

    return response.json();
  }

  async ocrUpload(imagePath: string, mode: string = "free_ocr") {
    const fs = require("fs");
    const FormData = require("form-data");
    
    const form = new FormData();
    form.append("file", fs.createReadStream(imagePath));
    form.append("mode", mode);
    form.append("base_size", "1024");

    const response = await fetch(`${this.baseUrl}/ocr/upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        ...form.getHeaders()
      },
      body: form
    });

    return response.json();
  }
}

// Usage
const client = new OCRClient("your_api_key");

const result = await client.ocrImage("document.jpg", "document_to_markdown");
console.log(result.result.markdown);
```

## Integration with Workflows

OCR can be integrated into workflows for automated document processing.

**Example Workflow:**
```json
{
  "name": "Invoice Processing Pipeline",
  "nodes": [
    {
      "id": "ocr_invoice",
      "type": "action",
      "config": {
        "actionType": "ocr",
        "mode": "grounded_ocr",
        "image": "{{invoice_image}}"
      },
      "next": ["extract_data"]
    },
    {
      "id": "extract_data",
      "type": "action",
      "config": {
        "actionType": "ai_completion",
        "prompt": "Extract invoice number, date, and total from: {{node_ocr_invoice}}"
      },
      "next": ["save_to_database"]
    }
  ]
}
```

## Performance Considerations

- **Resolution vs Speed:** Higher resolutions provide better accuracy but take longer to process
- **Batch Processing:** Use batch endpoints for multiple images to reduce overhead
- **Caching:** Results can be cached for frequently accessed documents
- **Async Processing:** For large documents, consider using async workflows

## Pricing

OCR operations are billed based on:
- **Vision Tokens:** Number of tokens used for image processing
- **Resolution:** Higher resolutions use more tokens
- **API Calls:** Each OCR request counts as one API call

**Token Usage by Resolution:**
- Tiny (512×512): 64 tokens
- Small (640×640): 100 tokens
- Base (1024×1024): 256 tokens
- Large (1280×1280): 400 tokens

## Limitations

- Maximum file size: 10MB per image
- Batch limit: 100 images per request
- PDF page limit: 50 pages per document
- Supported languages: English (primary), with support for other languages

## Best Practices

1. **Choose the right resolution:** Use the smallest resolution that meets your accuracy needs
2. **Preprocess images:** Crop, rotate, and enhance images before OCR for better results
3. **Use appropriate mode:** Select the OCR mode that matches your use case
4. **Batch similar tasks:** Group similar OCR tasks together for efficiency
5. **Cache results:** Store OCR results to avoid reprocessing the same documents

## Error Handling

```python
try:
    result = client.ocr_image("document.jpg")
    if result["status"] == "success":
        print(result["result"]["text"])
    else:
        print(f"OCR failed: {result.get('error')}")
except Exception as e:
    print(f"Request failed: {str(e)}")
```

## Support

For issues or questions about OCR integration:
- Check the [API Documentation](https://docs.aaiaas.ai)
- Visit our [GitHub Repository](https://github.com/your-org/aaiaas-platform)
- Contact support at support@aaiaas.ai

## References

- [DeepSeek-OCR GitHub](https://github.com/deepseek-ai/DeepSeek-OCR)
- [DeepSeek-OCR Paper](https://arxiv.org/abs/2510.18234)
- [aaIaaS.ai Documentation](https://docs.aaiaas.ai)

---

**DeepSeek-OCR** integration brings state-of-the-art document understanding to the aaIaaS.ai platform, enabling powerful OCR capabilities for all your document processing needs.

