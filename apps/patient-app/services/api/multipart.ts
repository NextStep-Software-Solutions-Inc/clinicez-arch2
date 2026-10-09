import { Platform } from 'react-native';

export interface UploadFile {
    uri: string;
    name: string;
    mimeType: string;
}

/**
 * Appends a picked file to a multipart body. Web needs a real Blob (fetched from the
 * object/blob URL); native uses React Native's `{ uri, name, type }` file descriptor.
 */
export async function appendFilePart(form: FormData, field: string, file: UploadFile): Promise<void> {
    if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        form.append(field, await response.blob(), file.name);
        return;
    }
    form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
}
