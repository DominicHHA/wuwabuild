import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePreview, ImageUploader } from './ImageComponents';
import { useOCRContext } from '../contexts/OCRContext';
import { OCRResponse, OCRAnalysis, CharacterAnalysis, WeaponAnalysis, SequenceAnalysis, ForteAnalysis } from '../types/ocr';
import { useCharacters } from '../hooks/useCharacters';
import { performOCR } from './OCR';
import '../styles/Scan.css';

interface ImageData {
  id: string;
  file: File;
  preview: string;
  isLoading: boolean;
  error?: string;
  category?: string;
  details?: string;
  base64?: string;
  readyToProcess: boolean;
  status: 'uploading' | 'ready' | 'processing' | 'queued' | 'complete' | 'error';
}

interface ScanProps {
  onOCRComplete: (result: OCRResponse) => void;
  currentCharacterType?: string;
}

const MAX_IMAGES = 10;
const TIMEOUT_MS = 30000;
const MAX_FILE_SIZE = 40 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(new Error('File reading failed: ' + error));
    reader.readAsDataURL(file);
  });
};

const validateFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Invalid file type. Only JPEG and PNG files are allowed.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File too large. Maximum size is 40MB.';
  }
  return null;
};

const getAnalysisDetails = (analysis?: OCRAnalysis): string | undefined => {
  if (!analysis) return undefined;
  
  switch (analysis.type) {
    case 'Character':
      return `Lv.${analysis.characterLevel} ${analysis.name}\nUID: ${analysis.uid}`;
    case 'Weapon':
      return `${analysis.weaponType}: ${analysis.name}\nLv.${analysis.weaponLevel} R${analysis.rank}`;
    case 'Sequences':
      return `Sequence ${analysis.sequence}`;
    case 'Forte':
      return 'Forte Tree';
    case 'Echo':
      return `Lv.${analysis.echoLevel} ${analysis.name}\n${analysis.element.charAt(0).toUpperCase() + analysis.element.slice(1)} | ${analysis.main.name}: ${analysis.main.value}`;
    default:
      return undefined;
  }
};

interface PendingResult {
  image: ImageData;
  result: OCRResponse;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

interface OCRError extends Error {
  status?: number;
  retryAfter?: number;
}

const fetchOCRResult = async (image: ImageData, retries = 3): Promise<PendingResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/api/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: image.base64 }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error() as OCRError;
      error.status = response.status;
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return fetchOCRResult(image, retries - 1);
        }
        error.message = 'Rate limit exceeded';
      } else {
        error.message = 'OCR request failed';
      }
      throw error;
    }

    const result: OCRResponse = await response.json();
    return { image, result };
  } catch (e) {
    const error = e as OCRError;
    return {
      image,
      result: {
        success: false,
        error: error.message || 'Request failed'
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const wakeupServer = async () => {
  try {
    await fetch(`${API_URL}/health`, { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
  }
};

export const Scan: React.FC<ScanProps> = ({ onOCRComplete, currentCharacterType }) => {
  const { setOCRResult, isLocked } = useOCRContext();
  const [images, setImages] = useState<ImageData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const blobUrlsRef = useRef<string[]>([]);
  const { characters } = useCharacters();
  const [hasQueueMessage, setHasQueueMessage] = useState(false);
  const pendingResultsRef = useRef<PendingResult[]>([]);
  const [showNotice, setShowNotice] = useState(true);

  useEffect(() => {
    wakeupServer();
  }, []);

  const clearImages = () => {
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    blobUrlsRef.current = [];
    setImages([]);
    setErrorMessages([]);
    setHasQueueMessage(false);
    setShowNotice(true);
  };

  const processResult = useCallback(async ({ image, result }: PendingResult) => {
    try {
      if (!result.success) {
        throw new Error(result.error || 'OCR processing failed');
      }
  
      if (result.analysis?.type === 'Character') {
        const characterAnalysis = result.analysis as CharacterAnalysis;
        const matchedCharacter = characters.find(char => 
          char.name.toLowerCase() === characterAnalysis.name.toLowerCase()
        );
        if (!matchedCharacter) {
          setErrorMessages(['Character not found']);
          return;
        }
      }
      else if (result.analysis?.type === 'Weapon' && currentCharacterType) {
        const weaponAnalysis = result.analysis as WeaponAnalysis;
        const normalizedWeaponType = weaponAnalysis.weaponType.replace(/s$/, '');
        
        if (normalizedWeaponType !== currentCharacterType) {
          setErrorMessages(prev => [...prev, 
            `Weapon mismatch:\nExpected: ${currentCharacterType}\nScanned: ${weaponAnalysis.weaponType}`
          ]);
        }
      }
  
      setOCRResult(result);
      onOCRComplete(result);
  
      setImages(prev => prev.map(img => 
        img.id === image.id ? 
          { 
            ...img, 
            category: result.analysis?.type,
            details: result.analysis ? getAnalysisDetails(result.analysis) : undefined,
            isLoading: false,
            status: 'complete'
          } : 
          img
      ));
    } catch (error) {
      setImages(prev => prev.map(img =>
        img.id === image.id ? 
          { 
            ...img, 
            error: error instanceof Error ? error.message : 'Unknown error', 
            isLoading: false,
            status: 'error'
          } : 
          img
      ));
    }
  }, [characters, currentCharacterType, onOCRComplete, setOCRResult]);

  const processResults = useCallback(async (results: PendingResult[]) => {
    const characterResults = results.filter(r => 
      r.result.success && r.result.analysis?.type === 'Character'
    );
  
    if (characterResults.length === 0 && isLocked) {
      pendingResultsRef.current.push(...results);
      setHasQueueMessage(true);
      setErrorMessages(['Select character first']);
      setImages(prev => prev.map(img => 
        results.find(r => r.image.id === img.id)
          ? { ...img, status: 'queued' }
          : img
      ));
      return;
    }
  
    for (const charResult of characterResults) {
      await processResult(charResult);
    }
  
    await new Promise(resolve => setTimeout(resolve, 100));
  
    const remainingResults = results.filter(r => !characterResults.includes(r));
    if (remainingResults.length > 0) {
      const weaponResults = remainingResults.filter(r => 
        r.result.analysis?.type === 'Weapon'
      );
      const otherResults = remainingResults.filter(r => 
        r.result.analysis?.type !== 'Weapon'
      );
  
      await Promise.all(otherResults.map(processResult));
      for (const weaponResult of weaponResults) {
        await processResult(weaponResult);
      }
    }
  }, [isLocked, processResult]);

  const handleFiles = async (files: File[]) => {
      if (images.length + files.length > MAX_IMAGES) {
          alert(`Maximum ${MAX_IMAGES} images allowed`);
          return;
      }
      
      setErrorMessages([]);
      setShowNotice(false);
  
      const validFiles = files.filter(file => {
          const error = validateFile(file);
          if (error) {
              setErrorMessages(prev => [...prev, `${file.name}: ${error}`]);
              return false;
          }
          return true;
      });
  
      if (validFiles.length === 0) return;
  
      const newImages = validFiles.map(file => ({
          id: Math.random().toString(36).substring(2),
          file,
          preview: URL.createObjectURL(file),
          status: 'uploading' as const,
          isLoading: true,
          readyToProcess: false
      }));
  
      setImages(prev => [...prev, ...newImages]);
  
      for (const img of newImages) {
          try {
              const base64 = await fileToBase64(img.file);
              const ocrResult = await performOCR({ imageData: base64, characters });
              
              if (ocrResult.type === 'Character' || ocrResult.type === 'Weapon' || ocrResult.type === 'Sequences' || ocrResult.type === 'Forte') {
                  await processResults([{
                      image: {
                          ...img,
                          base64,
                          isLoading: false,
                          readyToProcess: true,
                          status: 'processing'
                      },
                      result: {
                          success: true,
                          analysis: ocrResult as CharacterAnalysis | WeaponAnalysis | SequenceAnalysis | ForteAnalysis
                      }
                  }]);
              } else {
                  setImages(prev => prev.map(p => 
                      p.id === img.id ? {
                          ...p,
                          base64,
                          isLoading: false,
                          readyToProcess: true,
                          status: 'ready'
                      } : p
                  ));
              }
          } catch (error) {
              setImages(prev => prev.map(p => 
                  p.id === img.id ? {
                      ...p,
                      error: 'Failed to prepare image',
                      isLoading: false,
                      status: 'error'
                  } : p
              ));
          }
      }
  };

  const processImages = async () => {
    setErrorMessages([]);
    setIsProcessing(true);
    try {
      const readyImages = images.filter(img => 
        img.readyToProcess && img.base64 && img.status === 'ready'
      );
      
      setImages(prev => prev.map(img => 
        readyImages.find(ri => ri.id === img.id) 
          ? { ...img, status: 'processing' } 
          : img
      ));

      const results = await Promise.all(
        readyImages.map(img => fetchOCRResult(img))
      );
      
      await processResults(results);
    } finally {
      setIsProcessing(false);
    }
  };

  const processQueue = useCallback(async () => {
    if (!isLocked && pendingResultsRef.current.length > 0) {
      const queuedResults = [...pendingResultsRef.current];
      pendingResultsRef.current = [];
      try {
        await processResults(queuedResults);
      } catch (error) {
        setImages(prev => prev.map(img => ({
          ...img,
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false
        })));
      }
    }
  }, [isLocked, processResults]);

  useEffect(() => {
    if (!isLocked) {
      processQueue();
    }
  }, [isLocked, processQueue]);

  useEffect(() => {
    if (!isLocked && hasQueueMessage) {
      setHasQueueMessage(false);
      setErrorMessages(prev => prev.filter(msg => msg !== 'Select character first'));
    }
  }, [isLocked, hasQueueMessage]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const deleteImage = useCallback((id: string) => {
    setImages(prev => {
      const newImages = prev.filter(img => img.id !== id);
      if (newImages.length === 0) {
        setShowNotice(true);
      }
      return newImages;
    });
    
    const imageToDelete = images.find(img => img.id === id);
    if (imageToDelete?.preview) {
      URL.revokeObjectURL(imageToDelete.preview);
      blobUrlsRef.current = blobUrlsRef.current.filter(url => url !== imageToDelete.preview);
    }
  }, [images]);

  return (
    <div className="scan-component">
      {showNotice && (
        <div className="scan-notice">
          ⚠️ Important: Use FULL SCREEN screenshots only
          <span className="scan-notice-detail">
            Cropped or partial screenshots will not be recognized
          </span>
        </div>
      )}
      <div className="scan-controls">
        <ImageUploader 
          onFilesSelected={handleFiles} 
          disabled={isProcessing} 
        />
        {images.some(img => img.status === 'ready') && (
          <button
            className="process-button"
            onClick={processImages}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Process Images'}
          </button>
        )}
        {images.length > 0 && (
          <button 
            className="clear-button"
            onClick={clearImages}
            disabled={isProcessing}
          >
            Clear Images
          </button>
        )}
      </div>
      {errorMessages.length > 0 && (
        <div className="scan-errors">
          {errorMessages.map((message, index) => (
            <div key={index} className="error-message">
              {message}
            </div>
          ))}
        </div>
      )}
      <div className="file-preview">
        {images.map(image => (
          <ImagePreview
            key={image.id}
            src={image.preview}
            category={image.category}
            details={image.details}
            status={image.status}
            error={!!image.error}
            errorMessage={image.error}
            onDelete={() => deleteImage(image.id)}
          />
        ))}
      </div>
    </div>
  );
};