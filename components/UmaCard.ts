// Uma Card - PNG export/import with embedded JSON data
// Similar to SillyTavern's character cards

interface UmaCardData {
	version: number;
	horse: any; // HorseState JSON
}

// PNG signature bytes
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// Create a PNG tEXt chunk with keyword and text
function createTextChunk(keyword: string, text: string): Uint8Array {
	const keywordBytes = new TextEncoder().encode(keyword);
	const textBytes = new TextEncoder().encode(text);

	// Chunk layout: length (4) + type (4) + data (keyword + null + text) + CRC (4)
	const dataLength = keywordBytes.length + 1 + textBytes.length;
	const chunk = new Uint8Array(4 + 4 + dataLength + 4);
	const view = new DataView(chunk.buffer);

	// Length (big-endian)
	view.setUint32(0, dataLength, false);

	// Type "tEXt"
	chunk[4] = 116; // 't'
	chunk[5] = 69;  // 'E'
	chunk[6] = 88;  // 'X'
	chunk[7] = 116; // 't'

	// Data: keyword + null byte + text
	chunk.set(keywordBytes, 8);
	chunk[8 + keywordBytes.length] = 0; // null separator
	chunk.set(textBytes, 8 + keywordBytes.length + 1);

	// CRC32 of type + data
	const crc = calculateCRC32(chunk.slice(4, 4 + 4 + dataLength));
	view.setUint32(4 + 4 + dataLength, crc, false);

	return chunk;
}

// Simple CRC32 implementation for PNG chunks
function calculateCRC32(data: Uint8Array): number {
	const crcTable = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		crcTable[i] = c;
	}

	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Embed uma card data into a PNG image
export async function embedDataInPng(imageBlob: Blob, horseData: any): Promise<Blob> {
	const arrayBuffer = await imageBlob.arrayBuffer();
	const pngData = new Uint8Array(arrayBuffer);

	// Verify PNG signature
	for (let i = 0; i < PNG_SIGNATURE.length; i++) {
		if (pngData[i] !== PNG_SIGNATURE[i]) {
			throw new Error('Invalid PNG file');
		}
	}

	// Create uma card data structure
	const cardData: UmaCardData = {
		version: 1,
		horse: horseData
	};

	const jsonText = JSON.stringify(cardData);
	const textChunk = createTextChunk('UmaCard', jsonText);

	// Find the IEND chunk (last chunk in PNG)
	// PNG structure: signature + chunks, last chunk is IEND
	let iendPos = PNG_SIGNATURE.length;
	while (iendPos < pngData.length) {
		const view = new DataView(pngData.buffer, pngData.byteOffset + iendPos);
		const chunkLength = view.getUint32(0, false);
		const chunkType = String.fromCharCode(
			pngData[iendPos + 4],
			pngData[iendPos + 5],
			pngData[iendPos + 6],
			pngData[iendPos + 7]
		);

		if (chunkType === 'IEND') {
			break;
		}

		// Move to next chunk: length (4) + type (4) + data + CRC (4)
		iendPos += 4 + 4 + chunkLength + 4;
	}

	if (iendPos >= pngData.length) {
		throw new Error('IEND chunk not found in PNG');
	}

	// Insert our tEXt chunk before IEND
	const result = new Uint8Array(pngData.length + textChunk.length);
	result.set(pngData.slice(0, iendPos), 0);
	result.set(textChunk, iendPos);
	result.set(pngData.slice(iendPos), iendPos + textChunk.length);

	return new Blob([result], { type: 'image/png' });
}

// Extract uma card data from a PNG image
export async function extractDataFromPng(imageBlob: Blob): Promise<any | null> {
	const arrayBuffer = await imageBlob.arrayBuffer();
	const pngData = new Uint8Array(arrayBuffer);

	// Verify PNG signature
	for (let i = 0; i < PNG_SIGNATURE.length; i++) {
		if (pngData[i] !== PNG_SIGNATURE[i]) {
			return null; // Not a PNG
		}
	}

	// Search for our tEXt chunk with keyword "UmaCard"
	let pos = PNG_SIGNATURE.length;
	while (pos < pngData.length) {
		const view = new DataView(pngData.buffer, pngData.byteOffset + pos);
		const chunkLength = view.getUint32(0, false);
		const chunkType = String.fromCharCode(
			pngData[pos + 4],
			pngData[pos + 5],
			pngData[pos + 6],
			pngData[pos + 7]
		);

		if (chunkType === 'tEXt') {
			// Parse tEXt chunk: keyword + null + text
			const dataStart = pos + 8;
			const dataEnd = dataStart + chunkLength;
			const chunkData = pngData.slice(dataStart, dataEnd);

			// Find null separator
			let nullPos = 0;
			while (nullPos < chunkData.length && chunkData[nullPos] !== 0) {
				nullPos++;
			}

			const keyword = new TextDecoder().decode(chunkData.slice(0, nullPos));

			if (keyword === 'UmaCard') {
				const textData = new TextDecoder().decode(chunkData.slice(nullPos + 1));
				try {
					const cardData: UmaCardData = JSON.parse(textData);
					return cardData.horse;
				} catch (e) {
					console.error('Failed to parse uma card data:', e);
					return null;
				}
			}
		}

		if (chunkType === 'IEND') {
			break; // Reached end of PNG
		}

		// Move to next chunk
		pos += 4 + 4 + chunkLength + 4;
	}

	return null; // UmaCard chunk not found
}

// Fetch uma portrait and create uma card
export async function createUmaCard(outfitId: string, horseData: any): Promise<Blob> {
	// Fetch the uma portrait from icons directory
	// Icon path format: /uma-tools/icons/chara/trained_chr_icon_{uid}_{outfitId}_02.png
	let iconPath: string;
	if (outfitId) {
		const uid = outfitId.slice(0, 4); // First 4 digits are uma ID
		iconPath = `/uma-tools/icons/chara/trained_chr_icon_${uid}_${outfitId}_02.png`;
	} else {
		// Default to Special Week outfit 1 if no outfit specified
		iconPath = '/uma-tools/icons/chara/trained_chr_icon_1001_100101_02.png';
	}

	try {
		const response = await fetch(iconPath);
		if (!response.ok) {
			throw new Error(`Failed to fetch uma portrait: ${response.statusText}`);
		}

		const imageBlob = await response.blob();
		return await embedDataInPng(imageBlob, horseData);
	} catch (error) {
		console.error('Error creating uma card:', error);
		throw error;
	}
}
