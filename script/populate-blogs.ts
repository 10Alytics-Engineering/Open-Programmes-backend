import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const topics = [
  { title: "Data Science in 2026: The Next Frontier", content: "Data science continues to evolve rapidly. In this article, we explore the integration of large language models and predictive analytics in modern business workflows." },
  { title: "The Art of Business Analytics", content: "Analytics is more than just crunching numbers; it's about telling a compelling story. Learn how to transform raw datasets into actionable business strategies." },
  { title: "How to Build a Successful Career in AI", content: "Artificial intelligence is creating millions of jobs. Here is a step-by-step guide to mastering machine learning, deep learning, and landing your dream job." },
  { title: "Understanding Modern Business Intelligence", content: "Business intelligence tools have become democratized. Discover how self-service BI platforms are empowering employees at all levels to make data-driven decisions." },
  { title: "10 Analytics Insights for Growing Startups", content: "Startups must leverage analytics early to find product-market fit. We discuss the top 10 metrics every founder should track from day one." }
];

async function main() {
  console.log("Starting to seed mock blogs...");
  
  // We'll create 55 blogs to test pagination (50 limit per page)
  const countToCreate = 55;
  const createdBlogs = [];

  for (let i = 0; i < countToCreate; i++) {
    const topic = topics[i % topics.length];
    const index = i + 1;
    const minutesRead = `${Math.floor(Math.random() * 8) + 2} mins`;
    
    // Stagger dates so they have different creation times
    const createdAt = new Date(Date.now() - i * 2 * 3600 * 1000); // 2 hours apart

    const blog = await prisma.blog.create({
      data: {
        title: `${topic.title} (Part ${index})`,
        content: `${topic.content} This is post number ${index} in our test sequence. We want to ensure that the layout is responsive, looks extremely premium, and the infinite scroll loader/skeleton handles this perfectly.`,
        mins_read: minutesRead,
        createdAt: createdAt,
      }
    });
    createdBlogs.push(blog);
  }

  console.log(`Successfully created ${createdBlogs.length} mock blogs!`);
}

main()
  .catch((e) => {
    console.error("Error seeding blogs:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
