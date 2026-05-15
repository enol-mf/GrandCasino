export default function Card({ card, faceDown = false, small = false }) {
  if (!card || faceDown || card.suit === 'back') {
    return (
      <div className={`card-img${small ? ' card-small' : ''}`}>
        <img src="/cards/back_dark.png" alt="card back" />
      </div>
    );
  }
  const filename = `${card.suit}_${card.value}.png`;
  return (
    <div className={`card-img${small ? ' card-small' : ''}`}>
      <img src={`/cards/${filename}`} alt={`${card.value} of ${card.suit}`} />
    </div>
  );
}
