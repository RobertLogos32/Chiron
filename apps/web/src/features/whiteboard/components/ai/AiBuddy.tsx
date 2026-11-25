import buddyThinking from '../../../../assets/buddy/chiron-thinking.png';

export function AiBuddy({ waiting }: { waiting: boolean }) {
  return (
    <div className={`ai-buddy ${waiting ? 'is-thinking' : ''}`} aria-hidden="true">
      <img src={buddyThinking} alt="" width={56} height={56} draggable={false} />
      {waiting && <span className="ai-buddy-spinner" />}
    </div>
  );
}
