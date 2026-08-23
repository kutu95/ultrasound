import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCaseImage,
  fetchCaseImages,
  uploadCaseImages,
  type CaseImage,
} from '../lib/api';

interface CaseImagesProps {
  caseId: string;
  readOnly?: boolean;
}

export default function CaseImages({ caseId, readOnly = false }: CaseImagesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<CaseImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<CaseImage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchCaseImages(caseId);
      setImages(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await uploadCaseImages(caseId, Array.from(fileList));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(image: CaseImage) {
    if (!confirm(`Remove ${image.original_name}?`)) return;
    try {
      await deleteCaseImage(caseId, image.id);
      setImages((prev) => prev.filter((i) => i.id !== image.id));
      if (lightbox?.id === image.id) setLightbox(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete image');
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 style={{ margin: 0 }}>Screenshots</h2>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
            Attach ultrasound screenshots (JPEG, PNG, WebP, GIF).
          </p>
        </div>
        <div className="btn-group">
          {!readOnly && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Add images'}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="text-muted">Loading images…</div>
      ) : images.length === 0 ? (
        <div className="empty-state" style={{ padding: '1.25rem 0.5rem' }}>
          No screenshots attached yet.
        </div>
      ) : (
        <div className="image-grid">
          {images.map((image) => (
            <figure key={image.id} className="image-tile">
              <button
                type="button"
                className="image-tile-preview"
                onClick={() => setLightbox(image)}
                title={image.original_name}
              >
                <img src={image.url} alt={image.original_name} loading="lazy" />
              </button>
              <figcaption>
                <span className="image-tile-name" title={image.original_name}>
                  {image.original_name}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void handleDelete(image)}
                  >
                    Remove
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.original_name}
          onClick={() => setLightbox(null)}
        >
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.original_name} />
            <div className="lightbox-bar">
              <span>{lightbox.original_name}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLightbox(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
