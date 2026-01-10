import { MetricRecord } from '../api';

export type StatusColor = 'green' | 'yellow' | 'red' | 'purple' | 'gray';

export interface MetricInference {
	key: string;
	value: string | number;
	color: StatusColor;
	reason: string;
}

/**
 * Checks if a value matches any of the given rules.
 * Rules can be literal strings, numbers, or ranges (min:max).
 */
export const checkMatches = (
	valStr: string | undefined,
	valNum: number | undefined,
	rules: string[] | undefined
): boolean => {
	if (!rules || rules.length === 0) return false;

	for (const rule of rules) {
		if (rule.includes(':')) {
			if (valNum !== undefined) {
				const [minStr, maxStr] = rule.split(':');
				const min = parseFloat(minStr);
				const max = parseFloat(maxStr);
				if (!isNaN(min) && !isNaN(max)) {
					if (valNum >= min && valNum < max) return true;
				}
			}
		} else {
			// Literal match
			if (valStr !== undefined && valStr === rule) return true;
			if (valNum !== undefined) {
				const ruleNum = parseFloat(rule);
				if (!isNaN(ruleNum) && Math.abs(valNum - ruleNum) < 0.000001) return true;
			}
		}
	}
	return false;
};

/**
 * Determines the color of a single metric record based on its rules.
 */
export const getMetricColor = (metric: MetricRecord): StatusColor => {
	const valStr = metric.value_str;
	const valNum = metric.value;

	if (checkMatches(valStr, valNum, metric.yellow_if)) return 'yellow';
	if (checkMatches(valStr, valNum, metric.green_if)) return 'green';

	// Default for non-matching metrics is red if rules are defined
	if ((metric.green_if && metric.green_if.length > 0) || (metric.yellow_if && metric.yellow_if.length > 0)) {
		return 'red';
	}

	return 'gray';
};

/**
 * Infers the overall color from a list of metric inferences.
 * Logic: Red > Yellow > Green > Gray.
 */
export const inferOverallColor = (inferences: MetricInference[]): StatusColor => {
	if (inferences.length === 0) return 'gray';

	let highest: StatusColor = 'gray';
	const order: StatusColor[] = ['gray', 'green', 'yellow', 'red', 'purple'];

	for (const inf of inferences) {
		if (order.indexOf(inf.color) > order.indexOf(highest)) {
			highest = inf.color;
		}
	}

	return highest;
};
