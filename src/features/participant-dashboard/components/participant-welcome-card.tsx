type ParticipantWelcomeCardProps = {
  fullName: string;
};

export function ParticipantWelcomeCard({ fullName }: ParticipantWelcomeCardProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Welcome, {fullName} 👋
      </h1>
    </div>
  );
}
