import { randomInt } from "node:crypto";

export type DiceBearFunEmojiAvatar = {
  seed: string;
  eyesVariant: string;
  mouthVariant: string;
  backgroundColor: string;
};

export const diceBearFunEmojiAvatars: DiceBearFunEmojiAvatar[] = [
  {
    seed: "cocomama-beam",
    eyesVariant: "cute",
    mouthVariant: "wideSmile",
    backgroundColor: "f6d594",
  },
  {
    seed: "cocomama-bloom",
    eyesVariant: "love",
    mouthVariant: "smileTeeth",
    backgroundColor: "71cf62",
  },
  {
    seed: "cocomama-breezy",
    eyesVariant: "wink2",
    mouthVariant: "lilSmile",
    backgroundColor: "fcbc34",
  },
  {
    seed: "cocomama-bright",
    eyesVariant: "stars",
    mouthVariant: "smileLol",
    backgroundColor: "059ff2",
  },
  {
    seed: "cocomama-bubble",
    eyesVariant: "glasses",
    mouthVariant: "tongueOut",
    backgroundColor: "d9915b",
  },
  {
    seed: "cocomama-charm",
    eyesVariant: "wink",
    mouthVariant: "kissHeart",
    backgroundColor: "d84be5",
  },
  {
    seed: "cocomama-cheer",
    eyesVariant: "plain",
    mouthVariant: "wideSmile",
    backgroundColor: "71cf62",
  },
  {
    seed: "cocomama-dream",
    eyesVariant: "sleepClose",
    mouthVariant: "shy",
    backgroundColor: "f6d594",
  },
  {
    seed: "cocomama-glow",
    eyesVariant: "closed2",
    mouthVariant: "cute",
    backgroundColor: "fcbc34",
  },
  {
    seed: "cocomama-jolly",
    eyesVariant: "shades",
    mouthVariant: "smileTeeth",
    backgroundColor: "059ff2",
  },
  {
    seed: "cocomama-peace",
    eyesVariant: "closed",
    mouthVariant: "lilSmile",
    backgroundColor: "71cf62",
  },
  {
    seed: "cocomama-spark",
    eyesVariant: "tearDrop",
    mouthVariant: "smileLol",
    backgroundColor: "d84be5",
  },
];

export const buildDiceBearFunEmojiAvatarUrl = ({
  seed,
  eyesVariant,
  mouthVariant,
  backgroundColor,
}: DiceBearFunEmojiAvatar) => {
  const params = new URLSearchParams({
    seed,
    eyesVariant,
    mouthVariant,
    backgroundColor,
    borderRadius: "16",
  });

  return `https://api.dicebear.com/10.x/fun-emoji/svg?${params.toString()}`;
};

const diceBearFunEmojiAvatarUrls = new Set(
  diceBearFunEmojiAvatars.map(buildDiceBearFunEmojiAvatarUrl),
);

const profileDataUrlPattern =
  /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/;

export const getRandomDiceBearFunEmojiAvatarUrl = () =>
  buildDiceBearFunEmojiAvatarUrl(
    diceBearFunEmojiAvatars[randomInt(diceBearFunEmojiAvatars.length)] ??
      diceBearFunEmojiAvatars[0]!,
  );

export const isAllowedUserProfile = (value: string) =>
  profileDataUrlPattern.test(value) || diceBearFunEmojiAvatarUrls.has(value);
