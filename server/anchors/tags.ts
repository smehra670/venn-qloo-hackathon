/** Demo/mock topic fixtures for dual entity/tag resolve. */
export interface TagFixture {
  id: string;
  name: string;
  aliases?: string[];
}

export const TAG_FIXTURES: TagFixture[] = [
  { id: "tag:jazz", name: "Jazz", aliases: ["jazz music", "jazz"] },
  { id: "tag:natural-wine", name: "Natural Wine", aliases: ["natural wines", "natural wine"] },
  { id: "tag:yoga", name: "Yoga", aliases: ["yoga"] },
  { id: "tag:vinyl-records", name: "Vinyl Records", aliases: ["vinyl", "vinyl record", "vinyl records"] },
  { id: "tag:specialty-coffee", name: "Specialty Coffee", aliases: ["specialty coffee", "speciality coffee"] },
  { id: "tag:bookshop", name: "Bookshop", aliases: ["book shop", "bookstore", "bookstores", "bookshop"] },
  { id: "tag:ramen", name: "Ramen", aliases: ["ramen"] },
  { id: "tag:sourdough", name: "Sourdough", aliases: ["sourdough", "sourdough bread"] },
];
