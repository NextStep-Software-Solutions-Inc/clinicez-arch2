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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
      src: "/placeholder.svg",
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
        />
      )}
    />
  );
}
