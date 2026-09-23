"use client";

import SearchPaginatedList from "./SearchPaginatedList";
import ShellCard from "./ShellCard";

interface BaseShellItem {
  id: string;
  title: string;
  description?: string;
  image?: {
    src: string;
    alt?: string;
  };
  count: number;
  privacyPolicyUrl?: string;
  termsUrl?: string;
}

interface ClinicItem extends BaseShellItem {
  type: "clinic";
}

interface OrganizationItem extends BaseShellItem {
  type: "organization";
}

interface HpItem extends BaseShellItem {
  type: "hp";
}

type ShellItem = ClinicItem | OrganizationItem | HpItem;

interface ShellProps {
  data: ShellItem[];
  type: "clinics" | "organizations" | "hp";
}

// Mock data for different types
export const mockClinicsData: ClinicItem[] = [
  {
    id: "1",
    type: "clinic",
    title: "City Medical Center",
    description: "Comprehensive healthcare services with state-of-the-art facilities",
    image: {
      src: "https://images.unsplash.com/photo-1695059963363-01b3b528433c?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // hospital hallway
      alt: "City Medical Center"
    },
    count: 15
  },
  {
    id: "2",
    type: "clinic",
    title: "Downtown Health Clinic",
    description: "Primary care and preventive medicine specialists",
    image: {
      src: "https://images.unsplash.com/photo-1561647186-de5cc448cae3?q=80&w=820&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // clinic reception
      alt: "Downtown Health Clinic"
    },
    count: 8
  },
  {
    id: "3",
    type: "clinic",
    title: "Westside Family Practice",
    description: "Family medicine and pediatric care",
    image: {
      src: "https://images.unsplash.com/photo-1607838720191-0d8eba3e9040?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mjg5fHxob3NwaXRhbHxlbnwwfHwwfHx8MA%3D%3D", // family practice confirmed
      alt: "Westside Family Practice"
    },
    count: 12
  },
  {
    id: "4",
    type: "clinic",
    title: "Advanced Cardiology Center",
    description: "Specialized cardiac care and interventional procedures",
    image: {
      src: "https://images.unsplash.com/photo-1630444151121-e0816967ab32?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjIyfHxob3NwaXRhbHxlbnwwfHwwfHx8MA%3D%3D", // cardiology center
      alt: "Advanced Cardiology Center"
    },
    count: 6
  },
  {
    id: "5",
    type: "clinic",
    title: "Women's Health Clinic",
    description: "Comprehensive women's healthcare and reproductive services",
    image: {
      src: "https://images.unsplash.com/photo-1654762549297-2a145fcb9924?q=80&w=2942&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // women's health confirmed
      alt: "Women's Health Clinic"
    },
    count: 10
  },
  {
    id: "6",
    type: "clinic",
    title: "Pediatric Care Center",
    description: "Specialized care for children and adolescents",
    image: {
      src: "https://images.unsplash.com/photo-1578991624414-276ef23a534f?q=80&w=2054&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // pediatric care confirmed
      alt: "Pediatric Care Center"
    },
    count: 9
  }
];

export const mockOrganizationsData: OrganizationItem[] = [
  {
    id: "1",
    type: "organization",
    title: "Regional Health Network",
    description: "Connecting healthcare providers across the region",
    image: {
      src: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?q=80&w=2946&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // hospital team
      alt: "Regional Health Network"
    },
    count: 45
  },
  {
    id: "2",
    type: "organization",
    title: "Healthcare Innovation Hub",
    description: "Advancing medical technology and patient care",
    image: {
      src: "https://images.unsplash.com/photo-1596541223130-5d31a73fb6c6?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDB8fGhvc3BpdGFsfGVufDB8fDB8fHww", // innovation hub
      alt: "Healthcare Innovation Hub"
    },
    count: 28
  },
  {
    id: "3",
    type: "organization",
    title: "Community Health Alliance",
    description: "Promoting community wellness and preventive care",
    image: {
      src: "https://images.unsplash.com/photo-1578991624414-276ef23a534f?q=80&w=2054&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // community health
      alt: "Community Health Alliance"
    },
    count: 67
  },
  {
    id: "4",
    type: "organization",
    title: "Medical Research Institute",
    description: "Leading research in medical breakthroughs",
    image: {
      src: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8aG9zcGl0YWx8ZW58MHx8MHx8fDA%3D", // research institute
      alt: "Medical Research Institute"
    },
    count: 23
  }
];

export const mockHpData: HpItem[] = [
  {
    id: "1",
    type: "hp",
    title: "Dr. Sarah Johnson",
    description: "Internal Medicine Specialist with 15 years of experience",
    image: {
      src: "https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8ZG9jdG9yfGVufDB8fDB8fHww", // female doctor portrait
      alt: "Dr. Sarah Johnson"
    },
    count: 1200
  },
  {
    id: "2",
    type: "hp",
    title: "Dr. Michael Chen",
    description: "Cardiologist specializing in interventional procedures",
    image: {
      src: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8ZG9jdG9yfGVufDB8fDB8fHww", // male doctor portrait
      alt: "Dr. Michael Chen"
    },
    count: 850
  },
  {
    id: "3",
    type: "hp",
    title: "Dr. Emily Rodriguez",
    description: "Pediatrician with expertise in child development",
    image: {
      src: "https://images.unsplash.com/photo-1527613426441-4da17471b66d?auto=format&fit=crop&w=600&q=80", // female pediatrician
      alt: "Dr. Emily Rodriguez"
    },
    count: 950
  },
  {
    id: "4",
    type: "hp",
    title: "Dr. David Thompson",
    description: "Orthopedic surgeon specializing in sports medicine",
    image: {
      src: "https://images.unsplash.com/photo-1609188076864-c35269136b09?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // male surgeon portrait
      alt: "Dr. David Thompson"
    },
    count: 750
  },
  {
    id: "5",
    type: "hp",
    title: "Dr. Lisa Park",
    description: "Dermatologist with focus on cosmetic procedures",
    image: {
      src: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", // female doctor in clinic
      alt: "Dr. Lisa Park"
    },
    count: 680
  },
  {
    id: "6",
    type: "hp",
    title: "Dr. Robert Wilson",
    description: "Emergency medicine physician with trauma expertise",
    image: {
      src: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80", // male doctor in ER
      alt: "Dr. Robert Wilson"
    },
    count: 1100
  }
];

const getButtonConfig = (type: "clinics" | "organizations" | "hp", itemId: string) => {
  switch (type) {
    case "clinics":
      return {
        href: `/clinics/${itemId}`,
        text: "Join"
      };
    case "organizations":
      return {
        href: `/organizations/${itemId}`,
        text: "Join"
      };
    case "hp":
      return {
        href: `/hp/${itemId}`,
        text: "See All"
      };
    default:
      return {
        href: "#",
        text: "View"
      };
  }
};

const getContentTitle = (type: "clinics" | "organizations" | "hp") => {
  switch (type) {
    case "clinics":
      return "Healthcare Providers";
    case "organizations":
      return "Members";
    case "hp":
      return "Patients Served";
    default:
      return "Items";
  }
};

export default function Shell({ data, type }: ShellProps) {
  return (
    <SearchPaginatedList
      data={data}
      searchBy={(item, term) =>
        item.title.toLowerCase().includes(term) ||
        (item.description ? item.description.toLowerCase().includes(term) : false)
      }
      render={(item) => (
        <ShellCard
          title={item.title}
          description={item.description}
          image={item.image}
          content={{
            count: item.count,
            title: getContentTitle(type)
          }}
          button={getButtonConfig(type, item.id)}
          privacyPolicyUrl={item.privacyPolicyUrl || "/privacy"}
          termsUrl={item.termsUrl || "/terms"}
        />
      )}
    />
  );
}
