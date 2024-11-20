import React, { useState, useRef, useEffect } from 'react';
import domtoimage from 'dom-to-image';
import { Options } from './Build/Options';
import { CharacterSection } from './Build/CharacterSection';
import { Character } from '../types/character';
import '../styles/Build.css';

interface BuildCardProps {
  isVisible: boolean;
  selectedCharacter: Character | null;
  characterLevel: string;
  isSpectro: boolean;
  currentSequence: number;
}

interface WatermarkData {
  username: string;
  uid: string;
}

export const BuildCard: React.FC<BuildCardProps> = ({
  isVisible,
  selectedCharacter,
  characterLevel,
  isSpectro,
  currentSequence
}) => {
  const [isTabVisible, setIsTabVisible] = useState(false);
  const [watermark, setWatermark] = useState<WatermarkData>({
    username: '',
    uid: ''
  });
  const [showRollQuality, setShowRollQuality] = useState(true);
  const tabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTabVisible && tabRef.current) {
      setTimeout(() => {
        tabRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    }
  }, [isTabVisible]);

  const handleWatermarkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setWatermark(prev => ({
      ...prev,
      [id.replace('build-', '')]: value
    }));
  };

  const handleGenerate = () => {
    setIsTabVisible(true);
  };

  const handleDownload = () => {
    if (!tabRef.current) return;

    const now = new Date();
    const timestamp = now.toISOString().slice(0,19).replace(/[T:]/g, ' ');
    
    domtoimage.toPng(tabRef.current)
      .then((dataUrl: string) => {
        const link = document.createElement('a');
        link.download = `${timestamp}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((error: Error) => {
        console.error('Error capturing build-tab:', error);
      });
  };

  if (!isVisible) return null;
return (
  <div className="build-card">
    <Options
      watermark={watermark}
      showRollQuality={showRollQuality}
      onWatermarkChange={handleWatermarkChange}
      onRollQualityChange={setShowRollQuality}
    />

    <button
      id="generateDownload"
      className="build-button"
      onClick={handleGenerate}
    >
      Generate
    </button>

    <div
      ref={tabRef}
      id="build-tab"
      className="tab"
      style={{ 
        display: isTabVisible ? 'flex' : 'none',
        opacity: isTabVisible ? 1 : 0
      }}
    >
      {isTabVisible && selectedCharacter && (
        <>
          <CharacterSection 
            character={selectedCharacter!} 
            level={characterLevel || '90'}
            isSpectro={isSpectro}
            currentSequence={currentSequence}
          />
          <div className="watermark-container">
            <div className="watermark-username">{watermark.username}</div>
            <div className="watermark-uid">{watermark.uid}</div>
          </div>
        </>
      )}
    </div>

    {isTabVisible && (
      <button
        id="downloadButton"
        className="build-button"
        onClick={handleDownload}
      >
        Download
      </button>
    )}
  </div>
);
};