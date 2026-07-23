function getProfileInitial(label: string) {
  return label.replace(/@.*/, "").trim().charAt(0).toUpperCase() || "C";
}

export function ProfileAvatar({
  label,
  userProfile,
  className = "",
  initialClassName = "text-sm",
}: {
  label: string;
  userProfile?: string | null;
  className?: string;
  initialClassName?: string;
}) {
  const hasProfilePhoto = Boolean(userProfile);

  return (
    <span
      className={`grid place-items-center overflow-hidden rounded-full border border-border ${
        hasProfilePhoto
          ? "bg-cover bg-center bg-no-repeat"
          : "bg-text text-surface"
      } ${className}`}
      style={
        hasProfilePhoto
          ? {
              backgroundImage: `url(${userProfile})`,
            }
          : undefined
      }
      aria-hidden="true"
    >
      {hasProfilePhoto ? null : (
        <span className={`font-semibold ${initialClassName}`}>
          {getProfileInitial(label)}
        </span>
      )}
    </span>
  );
}
