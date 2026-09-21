export type Experience = {
  _id?: string;
  title: string;
  company: string;
  from: string;
  to?: string;
  description?: string;
};

// startDate/endDate are ISO datetime strings as returned by the backend
// (Mongoose Date -> JSON), not Date objects.
export type PortfolioProject = {
  _id?: string;
  title: string;
  description?: string;
  liveUrl: string;
  githubUrl: string;
  technologies: string[];
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
};

export type Profile = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "user";
  headline?: string;
  bio?: string;
  skills: string[];
  experiences: Experience[];
  portfolioProjects: PortfolioProject[];
};
