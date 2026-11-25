export function ChatAiIcon({
  size = 18,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/chiron-ai-icon.svg"
      className={`study-chat-ai-icon ${className}`.trim()}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
