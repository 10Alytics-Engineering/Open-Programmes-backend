export const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w-]+/g, '')  // Remove all non-word chars
    .replace(/--+/g, '-');    // Replace multiple - with single -
};

/**
 * Generates a unique slug for an assignment by checking the DB.
 * e.g. "assignment-1", then "assignment-1-2" if taken, etc.
 */
export const generateUniqueAssignmentSlug = async (
  title: string,
  prismaClient: any,
  excludeId?: string
): Promise<string> => {
  const base = slugify(title);
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = await prismaClient.assignment.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    // No clash, or the clash is the assignment we're updating itself
    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter++;
  }
};
