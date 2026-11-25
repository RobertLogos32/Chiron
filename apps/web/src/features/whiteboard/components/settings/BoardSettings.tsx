import type { Pattern } from '../../model/types';
import { BackgroundPicker } from './BackgroundPicker';
import { ZoomControls, type ZoomControlsProps } from './ZoomControls';

type BoardSettingsProps = {
  pattern: Pattern;
  zoom: number;
  onPatternChange: (pattern: Pattern) => void;
  onZoomChange: ZoomControlsProps['onChange'];
};

export function BoardSettings({
  pattern,
  zoom,
  onPatternChange,
  onZoomChange,
}: BoardSettingsProps) {
  return (
    <div className="board-settings" aria-label="Aspetto della lavagna">
      <ZoomControls zoom={zoom} onChange={onZoomChange} />
      <BackgroundPicker value={pattern} onChange={onPatternChange} />
    </div>
  );
}
