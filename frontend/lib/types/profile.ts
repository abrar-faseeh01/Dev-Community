export type Experience = {
  _id?: string;
  title: string;
  company: string;
  from: string;
  to?: string;
  description?: string;
};

export type Profile = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "user";
  skills: string[];
  experiences: Experience[];
};
