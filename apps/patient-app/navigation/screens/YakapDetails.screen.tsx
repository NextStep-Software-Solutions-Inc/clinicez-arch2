import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Screen from '../../components/layout/Screen';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ThemedText from '../../components/ui/ThemedText';
import { AppIcon, type IconName } from '../../components/ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BenefitItemProps {
  icon: IconName;
  iconBg: string;
  iconColor: 'primary' | 'success' | 'info' | 'text';
  title: string;
  description: string;
  bullets: string[];
}

function BenefitItem({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  bullets,
}: BenefitItemProps) {
  const { colors, radii, spacing, sizes } = useAppTheme();

  return (
    <Card padding="md" style={styles.benefitCard}>
      <View style={styles.benefitHeader}>
        <View
          style={[
            styles.benefitIconBox,
            { backgroundColor: iconBg, borderRadius: radii.md },
          ]}
        >
          <AppIcon name={icon} size={sizes.iconMd} color={iconColor} />
        </View>
        <ThemedText variant="h3" style={styles.flex}>
          {title}
        </ThemedText>
      </View>

      <ThemedText variant="small" color="textSecondary" style={styles.benefitDesc}>
        {description}
      </ThemedText>

      <View style={[styles.bulletList, { gap: spacing.xs }]}>
        {bullets.map((bullet, idx) => (
          <View key={idx} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: colors.primary, borderRadius: radii.full }]} />
            <ThemedText variant="small" color="text" style={styles.flex}>
              {bullet}
            </ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

interface StepItemProps {
  stepNumber: string;
  title: string;
  description: string;
  buttonLabel?: string;
  onButtonPress?: () => void;
  isLast?: boolean;
}

function StepItem({
  stepNumber,
  title,
  description,
  buttonLabel,
  onButtonPress,
  isLast,
}: StepItemProps) {
  const { colors, radii, spacing } = useAppTheme();

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepIndicatorCol}>
        <View
          style={[
            styles.stepBadge,
            { backgroundColor: colors.primaryLight, borderRadius: radii.full },
          ]}
        >
          <ThemedText variant="captionBold" color="primary">
            {stepNumber}
          </ThemedText>
        </View>
        {!isLast && <View style={[styles.stepLine, { backgroundColor: colors.border }]} />}
      </View>

      <View style={[styles.stepContent, { gap: spacing.xs, paddingBottom: isLast ? 0 : spacing.lg }]}>
        <ThemedText variant="bodyBold">{title}</ThemedText>
        <ThemedText variant="small" color="textSecondary">
          {description}
        </ThemedText>
        {buttonLabel && onButtonPress && (
          <View style={styles.stepActionRow}>
            <Button
              label={buttonLabel}
              variant="outline"
              size="sm"
              onPress={onButtonPress}
            />
          </View>
        )}
      </View>
    </View>
  );
}

interface FaqItemProps {
  question: string;
  answer: string;
}

function FaqItem({ question, answer }: FaqItemProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.faqRow, { borderBottomColor: colors.border }]}>
      <ThemedText variant="bodyBold" style={styles.faqQuestion}>
        {question}
      </ThemedText>
      <ThemedText variant="small" color="textSecondary" style={styles.faqAnswer}>
        {answer}
      </ThemedText>
    </View>
  );
}

export default function YakapDetailsScreen() {
  const { colors, radii, spacing, sizes } = useAppTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const handleNavigateClinics = () => {
    navigation.navigate('Main', { screen: 'ExploreClinicsScreen' });
  };

  const handleNavigateGovernmentIds = () => {
    navigation.navigate('Main', { screen: 'GovernmentIdsScreen' });
  };

  return (
    <Screen
      width="form"
      padded
      bottomInset={120}
      footer={
        <View
          style={[
            styles.footerContainer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.borderLight,
            },
          ]}
        >
          <View
            style={[
              styles.footerContent,
              {
                maxWidth: sizes.formMaxWidth,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
                gap: spacing.sm,
              },
            ]}
          >
            <Button
              label="Find an Accredited Clinic"
              variant="primary"
              size="md"
              icon="hospital"
              fullWidth
              onPress={handleNavigateClinics}
            />
            <Button
              label="Update PhilHealth Number"
              variant="outline"
              size="sm"
              icon="badge"
              fullWidth
              onPress={handleNavigateGovernmentIds}
            />
          </View>
        </View>
      }
    >
      <View style={[styles.contentContainer, { gap: spacing.xl }]}>
        {/* Hero Card */}
        <Card padding="lg" style={[styles.heroCard, { backgroundColor: colors.primarySubtle, borderColor: colors.primaryBorder }]}>
          <View style={styles.heroTop}>
            <View
              style={[
                styles.heroIconBox,
                { backgroundColor: colors.primaryLight, borderRadius: radii.md },
              ]}
            >
              <AppIcon name="shield" size={sizes.iconLg} color="primary" />
            </View>
            <Badge label="Free with PhilHealth" tone="success" size="md" />
          </View>

          <View style={{ gap: spacing.xs }}>
            <ThemedText variant="h2">Your Primary Care Health Benefits</ThemedText>
            <ThemedText variant="body" color="textSecondary" style={styles.heroDesc}>
              PhilHealth YAKAP provides every Filipino member and their dependents with free family doctor check-ups, routine laboratory tests, and essential prescription medicines at zero out-of-pocket cost.
            </ThemedText>
          </View>
        </Card>

        {/* What's Included */}
        <View style={{ gap: spacing.md }}>
          <ThemedText variant="h3">What&apos;s Included in Your Coverage</ThemedText>

          <BenefitItem
            icon="stethoscope"
            iconBg={colors.primaryLight}
            iconColor="primary"
            title="Free Doctor Consultations"
            description="Continuous primary care with an accredited family doctor at no charge."
            bullets={[
              'General check-ups and physical examinations',
              'Initial health risk assessment and personalized wellness guidance',
              'Regular follow-up consultations and chronic condition monitoring',
            ]}
          />

          <BenefitItem
            icon="lab"
            iconBg={colors.successBg}
            iconColor="success"
            title="Routine Laboratory Tests"
            description="Essential diagnostic and laboratory exams ordered by your doctor to monitor your health."
            bullets={[
              'Complete Blood Count (CBC) with platelet count',
              'Urinalysis and Fecalysis',
              'Fasting Blood Sugar (FBS) and HbA1c for diabetes screening',
              'Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)',
              'Chest X-Ray and Electrocardiogram (ECG)',
            ]}
          />

          <BenefitItem
            icon="pill"
            iconBg={colors.infoBg}
            iconColor="info"
            title="Annual Medicine Allowance (Up to ₱20,000/yr)"
            description="Up to ₱20,000 every year in free outpatient prescription medicines dispensed at accredited pharmacies."
            bullets={[
              '53 essential maintenance medications covered',
              'Maintenance drugs for high blood pressure, diabetes, and cholesterol',
              'Asthma inhalers, antibiotics, and common pain management medications',
              'Dispensed with zero co-payment using your digital prescription',
            ]}
          />
        </View>

        {/* How to Avail */}
        <View style={{ gap: spacing.md }}>
          <ThemedText variant="h3">How to Avail in 3 Simple Steps</ThemedText>

          <Card padding="lg">
            <StepItem
              stepNumber="1"
              title="Add your PhilHealth Number"
              description="Make sure your 12-digit PhilHealth ID number is saved in your profile so clinics can confirm your active membership."
              buttonLabel="Add PhilHealth Number"
              onButtonPress={handleNavigateGovernmentIds}
            />

            <StepItem
              stepNumber="2"
              title="Choose an Accredited Partner Clinic"
              description="Browse participating clinics and community health centers on ClinicEZ to select your preferred primary care provider."
              buttonLabel="Find a Clinic"
              onButtonPress={handleNavigateClinics}
            />

            <StepItem
              stepNumber="3"
              title="Complete your First Health Check-up"
              description="Visit your chosen clinic for an initial consultation. Your doctor will record your vitals, review your health questionnaire, and activate your annual medicine allowance."
              isLast
            />
          </Card>
        </View>

        {/* Common Questions */}
        <View style={{ gap: spacing.md }}>
          <ThemedText variant="h3">Frequently Asked Questions</ThemedText>

          <Card padding="md">
            <FaqItem
              question="Are these services really free?"
              answer="Yes. As long as you visit an accredited partner clinic on ClinicEZ, covered consultations, laboratory tests, and prescribed maintenance medicines have zero out-of-pocket fees."
            />
            <FaqItem
              question="Are my family members covered too?"
              answer="Yes. Qualified dependents registered under your PhilHealth account (legal spouse, children under 21 years old, and senior citizen parents) each receive their own separate benefits."
            />
            <FaqItem
              question="How do I get my free maintenance medicines?"
              answer="After your check-up, your doctor generates a secure digital prescription in the ClinicEZ app. You can present this digital prescription at participating partner pharmacy dispensaries."
            />
            <FaqItem
              question="Where can I view my prescriptions and health records?"
              answer="Your full health history, including your health check-up questionnaire and digital prescriptions, is always available in your Profile tab under Health Records."
            />
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 24,
  },
  heroCard: {
    gap: 16,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIconBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDesc: {
    lineHeight: 22,
  },
  benefitCard: {
    gap: 12,
  },
  benefitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitDesc: {
    lineHeight: 20,
  },
  bulletList: {
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    marginTop: 6,
  },
  stepContainer: {
    flexDirection: 'row',
    gap: 14,
  },
  stepIndicatorCol: {
    alignItems: 'center',
  },
  stepBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
  },
  stepActionRow: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  faqRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  faqQuestion: {
    lineHeight: 22,
  },
  faqAnswer: {
    lineHeight: 20,
  },
  footerContainer: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  footerContent: {
    width: '100%',
  },
  flex: {
    flex: 1,
  },
});
