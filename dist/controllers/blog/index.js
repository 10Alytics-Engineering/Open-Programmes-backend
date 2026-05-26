"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBlog = exports.updateBlog = exports.createBlog = exports.getBlog = exports.getBlogs = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getBlogs = async (req, res) => {
    try {
        const { limit, offset } = req.query;
        const findOptions = {
            include: {
                images: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        };
        if (limit) {
            findOptions.take = parseInt(limit, 10);
        }
        if (offset) {
            findOptions.skip = parseInt(offset, 10);
        }
        const blogs = await prismadb_1.prismadb.blog.findMany(findOptions);
        res.status(200).json({ status: "success", message: null, data: blogs });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getBlogs = getBlogs;
const getBlog = async (req, res) => {
    const { blogId } = req.params;
    try {
        const existingBlog = await prismadb_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
            include: {
                images: true,
            },
        });
        res
            .status(200)
            .json({
            status: "success",
            message: existingBlog ? null : "Nonexistent Blog!",
            data: existingBlog,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getBlog = getBlog;
const createBlog = async (req, res) => {
    const { title, content, mins_read, images, } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: "Title and Content is required" });
    }
    try {
        const blog = await prismadb_1.prismadb.blog.create({
            data: {
                title,
                content,
                mins_read,
                images: images && images.length ? {
                    create: images.map((image) => ({
                        url: image.url,
                    })),
                } : undefined,
            },
        });
        res.status(200).json({
            status: "success",
            message: "Blog created successfully",
            data: blog,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createBlog = createBlog;
const updateBlog = async (req, res) => {
    const { blogId } = req.params;
    const { title, content, mins_read, images, } = req.body;
    try {
        const existingBlog = await prismadb_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
        });
        if (!existingBlog) {
            return res.status(404).json({ message: "Nonexistent Blog!" });
        }
        await prismadb_1.prismadb.blog.update({
            where: {
                id: existingBlog.id,
            },
            data: {
                title,
                content,
                mins_read,
                images: {
                    deleteMany: {},
                },
            },
        });
        const blog = await prismadb_1.prismadb.blog.update({
            where: {
                id: existingBlog.id,
            },
            data: {
                title,
                content,
                mins_read,
                images: images && images.length ? {
                    create: images.map((image) => ({
                        url: image.url,
                    })),
                } : undefined,
            },
            include: {
                images: true
            }
        });
        res.status(200).json({
            status: "success",
            message: "Blog updated successfully",
            data: blog,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateBlog = updateBlog;
const deleteBlog = async (req, res) => {
    const { blogId } = req.params;
    try {
        const existingBlog = await prismadb_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
        });
        if (!existingBlog) {
            return res.status(404).json({ message: "Nonexistent Blog!" });
        }
        await prismadb_1.prismadb.blog.delete({
            where: {
                id: existingBlog.id,
            },
        });
        res
            .status(200)
            .json({ status: "success", message: "Blog deleted sucessfully" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteBlog = deleteBlog;
/*
export const seedBlogs = async (req: Request, res: Response) => {
  const blogsData = [
    {
      title: "10 Reasons to Start a Career in Data Analytics in 2026",
      mins_read: "5 mins read",
      images: ["https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=600&auto=format&fit=crop"],
      content: `
        <h2>Why Data Analytics is the Future of Work</h2>
        <p>In today's digital economy, data has become the new oil. From tech giants to traditional brick-and-mortar retail stores, organizations of all sizes are looking to harness the power of data to make informed, strategic decisions. Here are ten compelling reasons why starting a career in data analytics in 2026 is one of the smartest professional moves you can make:</p>
        <ul>
          <li><strong>High Demand, Low Supply:</strong> The demand for skilled data analysts continues to outpace the supply of qualified professionals.</li>
          <li><strong>Lucrative Compensation:</strong> Because of the shortage of skilled talent, data analysts enjoy highly competitive starting salaries and benefits.</li>
          <li><strong>Diverse Opportunities:</strong> Every industry—healthcare, finance, marketing, sports, and logistics—needs data expertise.</li>
          <li><strong>Continuous Learning:</strong> The field is constantly evolving, keeping your daily tasks interesting and stimulating.</li>
        </ul>
        <blockquote>"Data is a precious thing and will last longer than the systems themselves." — Tim Berners-Lee, Inventor of the World Wide Web.</blockquote>
      `
    },
    {
      title: "Mastering Power BI: Visualizing Data for Executive Decisions",
      mins_read: "4 mins read",
      images: [], // NO IMAGES AT ALL
      content: `
        <h2>The Art of Dashboard Design (Text Only Guide)</h2>
        <p>Creating a report is easy, but building a dashboard that tells a clear story to busy executives requires deliberate thought and design principles. When designing Power BI dashboards, you must prioritize clarity, speed, and responsiveness.</p>
        <h3>Key Best Practices for Executive Dashboards:</h3>
        <ul>
          <li><strong>Keep it simple:</strong> Limit the number of visuals on a single page to avoid cognitive overload.</li>
          <li><strong>Use high-level KPIs first:</strong> Place the most critical numbers at the very top-left of the screen.</li>
          <li><strong>Ensure logical color usage:</strong> Don't use color just for the sake of making it look colorful. Use color to draw attention or indicate performance.</li>
        </ul>
        <p>By mastering these dashboard techniques, your reports will transition from simple static charts to dynamic strategic tools that guide decision makers.</p>
      `
    },
    {
      title: "Data Engineering vs. Data Science: Which Pathway is Best for You?",
      mins_read: "6 mins read",
      images: [
        "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=600&auto=format&fit=crop", // image 0
        "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=600&auto=format&fit=crop"  // image 1
      ],
      content: `
        <h2>Understanding the Core Differences</h2>
        <p>Many beginners confuse Data Engineering with Data Science. While they both work with data, their responsibilities, workflows, and toolkits are fundamentally different.</p>
        <h3>Data Science: Extracting Insights</h3>
        <p>Data Scientists focus on finding patterns in data, building predictive machine learning models, and translating complex mathematical findings into business recommendations. Key tools include Python, Jupyter Notebooks, pandas, and scikit-learn.</p>
        
        <p>Here is an illustration of a modern cloud database infrastructure where data scientists run queries:</p>
        {{image:0}}
        
        <h3>Data Engineering: Building Pipelines</h3>
        <p>Data Engineers focus on building the infrastructure, databases, and pipelines that transport and clean raw data so that analysts and scientists can use it. Key tools include SQL, Apache Spark, Docker, Airflow, and Cloud Data Warehouses (Snowflake, BigQuery).</p>
        
        <p>And here is the coding workspace where engineering queries and pipelines are written:</p>
        {{image:1}}
        
        <blockquote>If data science is the engine of a racing car, data engineering is the chassis and fuel pipeline that keeps it running at peak performance.</blockquote>
      `
    },
    {
      title: "How to Build a Portfolio that Lands You a Data Analyst Job",
      mins_read: "7 mins read",
      images: ["https://images.unsplash.com/photo-1521791136368-1a8b27503462?q=80&w=600&auto=format&fit=crop"],
      content: `
        <h2>Your Resume Tells, Your Portfolio Shows</h2>
        <p>In the data space, certifications alone are no longer enough. Employers want to see evidence of what you can build. A strong, structured portfolio acts as your proof-of-concept.</p>
        <h3>Three Essential Projects Every Portfolio Needs:</h3>
        <ol>
          <li><strong>A Data Cleaning Project:</strong> Show that you can take messy, real-world data and prepare it for analysis. This is where 80% of an analyst's time is spent.</li>
          <li><strong>An Exploratory Data Analysis (EDA):</strong> Show that you can ask questions of a dataset, perform statistical testing, and extract interesting insights.</li>
          <li><strong>A Visualization Dashboard:</strong> Show that you can build interactive, intuitive dashboards that a business manager can use to answer questions.</li>
        </ol>
      `
    },
    {
      title: "The Rise of Generative AI in Corporate Data Intelligence",
      mins_read: "5 mins read",
      images: [], // NO IMAGES AT ALL
      content: `
        <h2>Generative AI as an Analytics Accelerator</h2>
        <p>Generative AI is transforming how we interact with corporate databases. Instead of writing complex SQL scripts, business users can now write natural language questions, and Large Language Models (LLMs) convert them into precise queries and charts instantly.</p>
        <p>However, this transition doesn't eliminate the need for human analysts. Instead, it elevates their role to focus on higher-level strategic analysis, data governance, and verifying the accuracy of AI-generated insights.</p>
        <blockquote>"AI won't replace data analysts, but data analysts who use AI will replace those who don't."</blockquote>
      `
    },
    {
      title: "SQL Best Practices: Writing Queries that Scale",
      mins_read: "4 mins read",
      images: [
        "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?q=80&w=600&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1527474305487-b87b222841cc?q=80&w=600&auto=format&fit=crop"
      ],
      content: `
        <h2>Optimizing SQL for Performance</h2>
        <p>Writing query code that runs on small test datasets is simple. However, running those same queries on production tables with millions of rows can cause severe performance bottlenecks.</p>
        
        <p>Below is a visual representation of standard server nodes where queries are processed:</p>
        {{image:0}}
        
        <h3>Core SQL Best Practices:</h3>
        <ul>
          <li><strong>Avoid SELECT *:</strong> Only retrieve the specific columns you need to save memory and network bandwidth.</li>
          <li><strong>Filter early with WHERE:</strong> Avoid pulling large datasets and filtering them later. Filter records as close to the source as possible.</li>
          <li><strong>Use indexing:</strong> Ensure columns frequently used in joins or filter conditions are properly indexed.</li>
        </ul>
        
        <p>Here is an AI-augmented environment showing modern schema mappings:</p>
        {{image:1}}
        
        <p>Following these simple guidelines will keep your database response times lightning fast and keep cloud storage costs minimal.</p>
      `
    },
    {
      title: "Key Metrics Every Business Intelligence Analyst Must Track",
      mins_read: "6 mins read",
      images: ["https://images.unsplash.com/photo-1551836022-d5d88e9218df?q=80&w=600&auto=format&fit=crop"],
      content: `
        <h2>Bridging Data and Strategy</h2>
        <p>A Business Intelligence (BI) Analyst's primary job is to monitor business performance. To do this effectively, you must understand which metrics drive business value and growth.</p>
        <h3>Critical Financial and Operational KPIs:</h3>
        <ul>
          <li><strong>Customer Acquisition Cost (CAC):</strong> The total cost of sales and marketing needed to win a single new customer.</li>
          <li><strong>Customer Lifetime Value (LTV):</strong> The total revenue a business expects to make from a customer over their relationship.</li>
          <li><strong>Churn Rate:</strong> The percentage of customers that stop doing business with your company over a given time period.</li>
        </ul>
      `
    },
    {
      title: "A Complete Guide to Transitioning from Excel to Python",
      mins_read: "5 mins read",
      images: [], // NO IMAGES AT ALL
      content: `
        <h2>Excel vs. Python: Stepping Up Your Data Game</h2>
        <p>Excel is an amazing tool, but when datasets grow to hundreds of thousands of rows, spreadsheets become sluggish and prone to human error. Python, with packages like pandas, offers a powerful, repeatable, and scalable solution.</p>
        <p>Moving to Python allows you to write automated scripts that read data files, clean them, perform calculations, and export clean reports automatically in seconds. This saves hours of manual work and ensures 100% reproducible results.</p>
      `
    },
    {
      title: "Designing Data-Driven Marketing Campaigns",
      mins_read: "5 mins read",
      images: ["https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=600&auto=format&fit=crop"],
      content: `
        <h2>The Power of Segmentation</h2>
        <p>Modern marketing campaigns succeed because of personalization. By analyzing customer purchase history, website engagement, and demographic data, marketers can segment audiences into highly targeted cohorts.</p>
        <p>Data-driven personalization leads to higher click-through rates, increased conversion rates, and much higher return on advertising spend (ROAS).</p>
      `
    },
    {
      title: "Data Privacy and Security in the Age of Cloud Analytics",
      mins_read: "6 mins read",
      images: [
        "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=600&auto=format&fit=crop"
      ],
      content: `
        <h2>Protecting Sensitive Information</h2>
        <p>With massive amounts of customer data stored in cloud data warehouses, security is more important than ever. Companies must implement strict access controls, encryption at rest, and audit logs to comply with regulations like GDPR and CCPA.</p>
        <p>Ensuring data privacy is not just a legal requirement; it is critical to building trust and maintaining customer loyalty in a digital-first world.</p>
      `
    }
  ];

  try {
    console.log("Seeding mixed blogs via endpoint...");
    await prismadb.blog.deleteMany({});
    
    for (const item of blogsData) {
      await prismadb.blog.create({
        data: {
          title: item.title,
          mins_read: item.mins_read,
          content: item.content,
          images: {
            create: item.images.map(url => ({ url }))
          }
        }
      });
    }

    res.status(200).json({ status: "success", message: `Seeded ${blogsData.length} mixed blogs successfully.` });
  } catch (error) {
    handleServerError(error, res);
  }
}; */
//# sourceMappingURL=index.js.map